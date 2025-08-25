;; GreenCredit - Carbon Credit Trading Platform
;; Transparent carbon credit marketplace with environmental impact tracking

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_NOT_AUTHORIZED (err u100))
(define-constant ERR_CREDIT_NOT_FOUND (err u101))
(define-constant ERR_INSUFFICIENT_CREDITS (err u102))
(define-constant ERR_INVALID_PRICE (err u103))
(define-constant ERR_CREDIT_RETIRED (err u104))
(define-constant ERR_INVALID_PROJECT (err u105))
(define-constant ERR_INVALID_AMOUNT (err u106))
(define-constant ERR_INVALID_VINTAGE_YEAR (err u107))
(define-constant ERR_CONTRACT_PAUSED (err u108))
(define-constant ERR_INVALID_STRING_LENGTH (err u109))
(define-constant ERR_REENTRANCY_GUARD (err u110))
(define-constant ERR_RATE_LIMIT_EXCEEDED (err u111))

;; Security constants
(define-constant MAX_STRING_LENGTH u500)
(define-constant MIN_VINTAGE_YEAR u2000)
(define-constant MAX_VINTAGE_YEAR u2100)
(define-constant MAX_CREDITS_PER_TRANSACTION u1000000) ;; 1M tons max per transaction
(define-constant MAX_PRICE_PER_TON u1000000000) ;; 1000 STX max per ton

;; Credit Types
(define-constant TYPE_RENEWABLE_ENERGY u1)
(define-constant TYPE_FOREST_CONSERVATION u2)
(define-constant TYPE_CARBON_CAPTURE u3)
(define-constant TYPE_METHANE_REDUCTION u4)

;; Data Variables
(define-data-var next-credit-id uint u1)
(define-data-var next-project-id uint u1)
(define-data-var platform-fee-rate uint u250) ;; 2.5% in basis points
(define-data-var contract-paused bool false)
(define-data-var reentrancy-guard bool false)
(define-data-var next-transaction-id uint u1)

;; Data Maps
(define-map carbon-credits
  { credit-id: uint }
  {
    project-id: uint,
    owner: principal,
    amount: uint,
    price-per-ton: uint,
    credit-type: uint,
    vintage-year: uint,
    created-at: uint,
    is-retired: bool,
    retirement-reason: (optional (string-ascii 200))
  }
)

(define-map carbon-projects
  { project-id: uint }
  {
    developer: principal,
    name: (string-ascii 100),
    description: (string-ascii 500),
    location: (string-ascii 100),
    project-type: uint,
    total-credits-issued: uint,
    verification-standard: (string-ascii 50),
    is-verified: bool,
    created-at: uint
  }
)

(define-map user-credits
  { user: principal }
  { credit-ids: (list 100 uint) }
)

(define-map credit-transactions
  { transaction-id: uint }
  {
    credit-id: uint,
    seller: principal,
    buyer: principal,
    amount: uint,
    price-per-ton: uint,
    transaction-at: uint
  }
)

(define-map project-stats
  { project-type: uint }
  { total-projects: uint, total-credits: uint, total-retired: uint }
)

;; Security Maps
(define-map authorized-verifiers
  { verifier: principal }
  { is-authorized: bool, added-at: uint }
)

(define-map rate-limits
  { user: principal }
  { last-action: uint, action-count: uint }
)

;; Private Functions

;; Security Guards
(define-private (check-contract-not-paused)
  (begin
    (asserts! (not (var-get contract-paused)) ERR_CONTRACT_PAUSED)
    (ok true)
  )
)

(define-private (check-reentrancy-guard)
  (begin
    (asserts! (not (var-get reentrancy-guard)) ERR_REENTRANCY_GUARD)
    (ok true)
  )
)



;; Input Validation
(define-private (validate-string-length (str (string-ascii 500)))
  (begin
    (asserts! (<= (len str) MAX_STRING_LENGTH) ERR_INVALID_STRING_LENGTH)
    (ok true)
  )
)

(define-private (validate-amount (amount uint))
  (begin
    (asserts! (and (> amount u0) (<= amount MAX_CREDITS_PER_TRANSACTION)) ERR_INVALID_AMOUNT)
    (ok true)
  )
)

(define-private (validate-price (price uint))
  (begin
    (asserts! (and (> price u0) (<= price MAX_PRICE_PER_TON)) ERR_INVALID_PRICE)
    (ok true)
  )
)

(define-private (validate-vintage-year (year uint))
  (begin
    (asserts! (and (>= year MIN_VINTAGE_YEAR) (<= year MAX_VINTAGE_YEAR)) ERR_INVALID_VINTAGE_YEAR)
    (ok true)
  )
)

;; Validation functions that return validated values with correct types
(define-private (validate-and-return-name (str (string-ascii 100)))
  (begin
    (asserts! (<= (len str) u100) ERR_INVALID_STRING_LENGTH)
    (ok str)
  )
)

(define-private (validate-and-return-description (str (string-ascii 500)))
  (begin
    (asserts! (<= (len str) MAX_STRING_LENGTH) ERR_INVALID_STRING_LENGTH)
    (ok str)
  )
)

(define-private (validate-and-return-location (str (string-ascii 100)))
  (begin
    (asserts! (<= (len str) u100) ERR_INVALID_STRING_LENGTH)
    (ok str)
  )
)

(define-private (validate-and-return-verification-standard (str (string-ascii 50)))
  (begin
    (asserts! (<= (len str) u50) ERR_INVALID_STRING_LENGTH)
    (ok str)
  )
)

(define-private (validate-and-return-amount (amount uint))
  (begin
    (asserts! (and (> amount u0) (<= amount MAX_CREDITS_PER_TRANSACTION)) ERR_INVALID_AMOUNT)
    (ok amount)
  )
)

(define-private (validate-and-return-price (price uint))
  (begin
    (asserts! (and (> price u0) (<= price MAX_PRICE_PER_TON)) ERR_INVALID_PRICE)
    (ok price)
  )
)

(define-private (validate-and-return-year (year uint))
  (begin
    (asserts! (and (>= year MIN_VINTAGE_YEAR) (<= year MAX_VINTAGE_YEAR)) ERR_INVALID_VINTAGE_YEAR)
    (ok year)
  )
)

;; Rate Limiting
(define-private (check-rate-limit (user principal))
  (let ((current-block stacks-block-height)
        (rate-data (default-to { last-action: u0, action-count: u0 }
                               (map-get? rate-limits { user: user }))))
    (if (> (- current-block (get last-action rate-data)) u10) ;; 10 blocks cooldown
      (begin
        (map-set rate-limits { user: user } { last-action: current-block, action-count: u1 })
        (ok true)
      )
      (if (< (get action-count rate-data) u5) ;; Max 5 actions per cooldown period
        (begin
          (map-set rate-limits { user: user }
                   (merge rate-data { action-count: (+ (get action-count rate-data) u1) }))
          (ok true)
        )
        ERR_RATE_LIMIT_EXCEEDED
      )
    )
  )
)

(define-private (add-credit-to-user (user principal) (credit-id uint))
  (let ((current-credits (default-to (list) (get credit-ids (map-get? user-credits { user: user })))))
    (match (as-max-len? (append current-credits credit-id) u100)
      new-credits (begin
        (map-set user-credits
          { user: user }
          { credit-ids: new-credits }
        )
        (ok true)
      )
      (err u999)
    )
  )
)

(define-private (calculate-platform-fee (amount uint))
  (/ (* amount (var-get platform-fee-rate)) u10000)
)

(define-private (is-valid-credit-type (credit-type uint))
  (or 
    (is-eq credit-type TYPE_RENEWABLE_ENERGY)
    (is-eq credit-type TYPE_FOREST_CONSERVATION)
    (is-eq credit-type TYPE_CARBON_CAPTURE)
    (is-eq credit-type TYPE_METHANE_REDUCTION)
  )
)

;; Public Functions

;; Register carbon project
(define-public (register-project
  (name (string-ascii 100))
  (description (string-ascii 500))
  (location (string-ascii 100))
  (project-type uint)
  (verification-standard (string-ascii 50))
)
  (let ((project-id (var-get next-project-id)))
    ;; Security checks
    (try! (check-contract-not-paused))
    (try! (check-reentrancy-guard))
    (try! (check-rate-limit tx-sender))
    (var-set reentrancy-guard true)

    ;; Input validation
    (asserts! (<= (len name) u100) ERR_INVALID_STRING_LENGTH)
    (asserts! (<= (len description) MAX_STRING_LENGTH) ERR_INVALID_STRING_LENGTH)
    (asserts! (<= (len location) u100) ERR_INVALID_STRING_LENGTH)
    (asserts! (<= (len verification-standard) u50) ERR_INVALID_STRING_LENGTH)
    (asserts! (is-valid-credit-type project-type) ERR_INVALID_PROJECT)

    ;; Store project
    (map-set carbon-projects
      { project-id: project-id }
      {
        developer: tx-sender,
        name: name,
        description: description,
        location: location,
        project-type: project-type,
        total-credits-issued: u0,
        verification-standard: verification-standard,
        is-verified: false,
        created-at: stacks-block-height
      }
    )
    
    ;; Update project type stats
    (match (map-get? project-stats { project-type: project-type })
      stats-data 
      (map-set project-stats
        { project-type: project-type }
        (merge stats-data { total-projects: (+ (get total-projects stats-data) u1) })
      )
      (map-set project-stats
        { project-type: project-type }
        { total-projects: u1, total-credits: u0, total-retired: u0 }
      )
    )
    
    ;; Increment project ID
    (var-set next-project-id (+ project-id u1))

    ;; Reset reentrancy guard
    (var-set reentrancy-guard false)

    (ok project-id)
  )
)

;; Issue carbon credits
(define-public (issue-credits
  (project-id uint)
  (amount uint)
  (price-per-ton uint)
  (vintage-year uint)
)
  (begin
    ;; Input validation
    (asserts! (> project-id u0) ERR_INVALID_PROJECT)
    (asserts! (and (> amount u0) (<= amount MAX_CREDITS_PER_TRANSACTION)) ERR_INVALID_AMOUNT)
    (asserts! (and (> price-per-ton u0) (<= price-per-ton MAX_PRICE_PER_TON)) ERR_INVALID_PRICE)
    (asserts! (and (>= vintage-year MIN_VINTAGE_YEAR) (<= vintage-year MAX_VINTAGE_YEAR)) ERR_INVALID_VINTAGE_YEAR)

    (let ((project-data (unwrap! (map-get? carbon-projects { project-id: project-id }) ERR_INVALID_PROJECT))
          (credit-id (var-get next-credit-id)))
      ;; Security checks
      (try! (check-contract-not-paused))
      (try! (check-reentrancy-guard))
      (try! (check-rate-limit tx-sender))
      (var-set reentrancy-guard true)

    ;; Authorization checks
    (asserts! (is-eq tx-sender (get developer project-data)) ERR_NOT_AUTHORIZED)
    (asserts! (get is-verified project-data) ERR_INVALID_PROJECT)

    ;; Store credit
    (map-set carbon-credits
      { credit-id: credit-id }
      {
        project-id: project-id,
        owner: tx-sender,
        amount: amount,
        price-per-ton: price-per-ton,
        credit-type: (get project-type project-data),
        vintage-year: vintage-year,
        created-at: stacks-block-height,
        is-retired: false,
        retirement-reason: none
      }
    )

    ;; Update project stats
    (map-set carbon-projects
      { project-id: project-id }
      (merge project-data { total-credits-issued: (+ (get total-credits-issued project-data) amount) })
    )
    
    ;; Update type stats
    (match (map-get? project-stats { project-type: (get project-type project-data) })
      stats-data 
      (map-set project-stats
        { project-type: (get project-type project-data) }
        (merge stats-data { total-credits: (+ (get total-credits stats-data) amount) })
      )
      false
    )
    
    ;; Add to user credits
    (try! (add-credit-to-user tx-sender credit-id))
    
    ;; Increment credit ID
    (var-set next-credit-id (+ credit-id u1))

    ;; Reset reentrancy guard
    (var-set reentrancy-guard false)

    (ok credit-id)
    )
  )
)

;; Purchase carbon credits
(define-public (purchase-credits (credit-id uint) (amount uint))
  (begin
    ;; Input validation
    (asserts! (> credit-id u0) ERR_CREDIT_NOT_FOUND)
    (asserts! (and (> amount u0) (<= amount MAX_CREDITS_PER_TRANSACTION)) ERR_INVALID_AMOUNT)

    (let ((credit-data (unwrap! (map-get? carbon-credits { credit-id: credit-id }) ERR_CREDIT_NOT_FOUND))
          (total-cost (* amount (get price-per-ton credit-data)))
          (platform-fee (calculate-platform-fee total-cost)))
      (asserts! (not (get is-retired credit-data)) ERR_CREDIT_RETIRED)
      (asserts! (>= (get amount credit-data) amount) ERR_INSUFFICIENT_CREDITS)
      (asserts! (not (is-eq tx-sender (get owner credit-data))) ERR_NOT_AUTHORIZED)
    
    ;; Transfer payment to seller
    (try! (stx-transfer? total-cost tx-sender (get owner credit-data)))
    
    ;; Transfer platform fee
    (try! (stx-transfer? platform-fee tx-sender CONTRACT_OWNER))
    
    ;; Update credit ownership
    (if (is-eq amount (get amount credit-data))
      ;; Transfer entire credit
      (begin
        (map-set carbon-credits
          { credit-id: credit-id }
          (merge credit-data { owner: tx-sender })
        )
        (try! (add-credit-to-user tx-sender credit-id))
      )
      ;; Split credit
      (let ((new-credit-id (var-get next-credit-id)))
        ;; Update original credit
        (map-set carbon-credits
          { credit-id: credit-id }
          (merge credit-data { amount: (- (get amount credit-data) amount) })
        )
        
        ;; Create new credit for buyer
        (map-set carbon-credits
          { credit-id: new-credit-id }
          (merge credit-data { 
            owner: tx-sender,
            amount: amount,
            created-at: stacks-block-height
          })
        )
        
        (try! (add-credit-to-user tx-sender new-credit-id))
        (var-set next-credit-id (+ new-credit-id u1))
        true
      )
    )

    (ok true)
    )
  )
)

;; Retire carbon credits
(define-public (retire-credits
  (credit-id uint)
  (amount uint)
  (reason (string-ascii 200))
)
  (begin
    ;; Input validation
    (asserts! (> credit-id u0) ERR_CREDIT_NOT_FOUND)
    (asserts! (and (> amount u0) (<= amount MAX_CREDITS_PER_TRANSACTION)) ERR_INVALID_AMOUNT)
    (asserts! (<= (len reason) u200) ERR_INVALID_STRING_LENGTH)

    (let ((credit-data (unwrap! (map-get? carbon-credits { credit-id: credit-id }) ERR_CREDIT_NOT_FOUND)))
      (asserts! (is-eq tx-sender (get owner credit-data)) ERR_NOT_AUTHORIZED)
      (asserts! (not (get is-retired credit-data)) ERR_CREDIT_RETIRED)
      (asserts! (>= (get amount credit-data) amount) ERR_INSUFFICIENT_CREDITS)
    
    ;; Update credit retirement status
    (if (is-eq amount (get amount credit-data))
      ;; Retire entire credit
      (map-set carbon-credits
        { credit-id: credit-id }
        (merge credit-data { 
          is-retired: true,
          retirement-reason: (some reason)
        })
      )
      ;; Partial retirement - split credit
      (let ((new-credit-id (var-get next-credit-id)))
        ;; Update original credit
        (map-set carbon-credits
          { credit-id: credit-id }
          (merge credit-data { amount: (- (get amount credit-data) amount) })
        )
        
        ;; Create retired credit
        (map-set carbon-credits
          { credit-id: new-credit-id }
          (merge credit-data { 
            amount: amount,
            is-retired: true,
            retirement-reason: (some reason),
            created-at: stacks-block-height
          })
        )
        
        (try! (add-credit-to-user tx-sender new-credit-id))
        (var-set next-credit-id (+ new-credit-id u1))
        true
      )
    )
    
    ;; Update type stats
    (match (map-get? project-stats { project-type: (get credit-type credit-data) })
      stats-data 
      (map-set project-stats
        { project-type: (get credit-type credit-data) }
        (merge stats-data { total-retired: (+ (get total-retired stats-data) amount) })
      )
      false
    )

    (ok true)
    )
  )
)

;; Verify project (contract owner only)
(define-public (verify-project (project-id uint))
  (begin
    ;; Input validation
    (asserts! (> project-id u0) ERR_INVALID_PROJECT)

    (let ((project-data (unwrap! (map-get? carbon-projects { project-id: project-id }) ERR_INVALID_PROJECT)))
      (asserts! (is-eq tx-sender CONTRACT_OWNER) ERR_NOT_AUTHORIZED)

      (map-set carbon-projects
        { project-id: project-id }
        (merge project-data { is-verified: true })
      )

      (ok true)
    )
  )
)

;; Read-only Functions
(define-read-only (get-credit (credit-id uint))
  (map-get? carbon-credits { credit-id: credit-id })
)

(define-read-only (get-project (project-id uint))
  (map-get? carbon-projects { project-id: project-id })
)

(define-read-only (get-user-credits (user principal))
  (default-to (list) (get credit-ids (map-get? user-credits { user: user })))
)

(define-read-only (get-project-type-stats (project-type uint))
  (map-get? project-stats { project-type: project-type })
)

(define-read-only (get-platform-stats)
  (ok {
    total-credits: (- (var-get next-credit-id) u1),
    total-projects: (- (var-get next-project-id) u1),
    platform-fee-rate: (var-get platform-fee-rate)
  })
)
