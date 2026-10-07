// Generated from contracts/openapi.yaml. Do not edit directly.

export interface components {
  schemas: {
    "JournalSnapshot": {
      "challenge_id": string
      "local_date": string
      "journal": string | null
      "journal_version": number
    }
    "JournalReadResult": {
      "journal": components['schemas']["JournalSnapshot"]
    }
    "JournalMutationResult": {
      "journal": components['schemas']["JournalSnapshot"]
      "account_revision": number
      "data_epoch": number
    }
    "SaveJournalRequest": {
      "command_id": string
      "data_epoch": number
      "base_version": number
      "journal": string
    }
    "AccountContext": {
      "timezone": "Asia/Ho_Chi_Minh"
      "account_date": string
      "week": components['schemas']["AccountWeek"]
      "account_revision": number
      "data_epoch": number
      "write_state": "open" | "locked_for_import"
    }
    "AccountWeek": {
      "start_date": string
      "end_date": string
    }
    "Owner": {
      "id": number
      "name": string
      "email": string
    }
    "OwnerSession": {
      "owner": components['schemas']["Owner"]
    }
    "LoginRequest": {
      "email": string
      "password": string
      "redirect_to"?: string | null
    }
    "LoginResult": {
      "owner": components['schemas']["Owner"]
      "redirect_to": "/today" | "/challenges" | "/notes" | "/calendar" | "/settings"
    }
    "ApiError": {
      "message": string
      "code"?: "csrf_expired"
    }
    "ValidationError": {
      "message": string
      "errors": Record<string, Array<string>>
    }
    "FoundationHealth": {
      "status": "ok"
      "service": "noteflow-api"
    }
    "Challenge": {
      "id": string
      "name": string
      "description": string | null
      "start_date": string
      "target_days": number
      "row_version": number
      "created_at": string
      "updated_at": string
    }
    "ChallengeSnapshot": {
      "id": string
      "name": string
      "description": string | null
      "start_date": string
      "target_days": number
      "row_version": number
    }
    "ChallengeListResult": {
      "challenges": Array<components['schemas']["Challenge"]>
    }
    "ChallengeDetailResult": {
      "challenge": components['schemas']["Challenge"]
    }
    "ChallengeMutationResult": {
      "challenge": components['schemas']["Challenge"]
      "account_revision": number
      "data_epoch": number
    }
    "CreateChallengeRequest": {
      "command_id": string
      "data_epoch": number
      "name": string
      "description"?: string | null
      "target_days": number
    }
    "UpdateChallengeMetadataRequest": {
      "command_id": string
      "data_epoch": number
      "base_version": number
      "name": string
      "description"?: string | null
    }
    "StateProblemDetails": {
      "message": string
      "code": "stale_data_epoch" | "idempotency_key_reused" | "write_fence_active"
    }
    "ChallengeConflictProblemDetails": {
      "message": string
      "code": "version_conflict"
      "resource_id": string
      "current_version": number
      "current_snapshot": components['schemas']["ChallengeSnapshot"]
    }
    "JournalConflictProblemDetails": {
      "message": string
      "code": "version_conflict"
      "resource_id": string
      "current_version": number
      "current_snapshot": components['schemas']["JournalSnapshot"]
    }
    "ChallengeProblemDetails": components['schemas']["StateProblemDetails"] | components['schemas']["ChallengeConflictProblemDetails"]
    "JournalProblemDetails": components['schemas']["StateProblemDetails"] | components['schemas']["JournalConflictProblemDetails"]
  }
}

export interface operations {
  "loginOwner": {
    path: "/login"
    method: "POST"
    parameters: Record<string, never>
    requestBody: {
      required: true
      content: {
        "application/json": {
      "email": string
      "password": string
      "redirect_to"?: string | null
    }
      }
    }
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["LoginResult"]
        }
      }
      "419": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "422": {
        content: {
          "application/json": components['schemas']["ValidationError"]
        }
      }
      "429": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
    }
  }
  "logoutOwner": {
    path: "/logout"
    method: "POST"
    parameters: Record<string, never>
    responses: {
      "204": {
        content: Record<string, never>
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "419": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
    }
  }
  "getOwnerSession": {
    path: "/api/v1/session"
    method: "GET"
    parameters: Record<string, never>
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["OwnerSession"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
    }
  }
  "foundationHealth": {
    path: "/api/v1/foundation"
    method: "GET"
    parameters: Record<string, never>
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["FoundationHealth"]
        }
      }
    }
  }
  "getAccountContext": {
    path: "/api/v1/account"
    method: "GET"
    parameters: Record<string, never>
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["AccountContext"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
    }
  }
  "getChallenges": {
    path: "/api/v1/challenges"
    method: "GET"
    parameters: Record<string, never>
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["ChallengeListResult"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
    }
  }
  "createChallenge": {
    path: "/api/v1/challenges"
    method: "POST"
    parameters: Record<string, never>
    requestBody: {
      required: true
      content: {
        "application/json": {
      "command_id": string
      "data_epoch": number
      "name": string
      "description"?: string | null
      "target_days": number
    }
      }
    }
    responses: {
      "201": {
        content: {
          "application/json": components['schemas']["ChallengeMutationResult"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "409": {
        content: {
          "application/problem+json": components['schemas']["ChallengeProblemDetails"]
        }
      }
      "422": {
        content: {
          "application/json": components['schemas']["ValidationError"]
        }
      }
      "423": {
        content: {
          "application/problem+json": components['schemas']["StateProblemDetails"]
        }
      }
    }
  }
  "getChallenge": {
    path: "/api/v1/challenges/{id}"
    method: "GET"
    parameters: {
      "path:id": {
        name: "id"
        in: "path"
        required: true
        schema: string
      }
    }
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["ChallengeDetailResult"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "404": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
    }
  }
  "updateChallengeMetadata": {
    path: "/api/v1/challenges/{id}"
    method: "PATCH"
    parameters: {
      "path:id": {
        name: "id"
        in: "path"
        required: true
        schema: string
      }
    }
    requestBody: {
      required: true
      content: {
        "application/json": {
      "command_id": string
      "data_epoch": number
      "base_version": number
      "name": string
      "description"?: string | null
    }
      }
    }
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["ChallengeMutationResult"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "404": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "409": {
        content: {
          "application/problem+json": components['schemas']["ChallengeProblemDetails"]
        }
      }
      "422": {
        content: {
          "application/json": components['schemas']["ValidationError"]
        }
      }
      "423": {
        content: {
          "application/problem+json": components['schemas']["StateProblemDetails"]
        }
      }
    }
  }
  "getChallengeJournal": {
    path: "/api/v1/challenges/{id}/journals/{date}"
    method: "GET"
    parameters: {
      "path:id": {
        name: "id"
        in: "path"
        required: true
        schema: string
      }
      "path:date": {
        name: "date"
        in: "path"
        required: true
        schema: string
      }
    }
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["JournalReadResult"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "404": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "422": {
        content: {
          "application/json": components['schemas']["ValidationError"]
        }
      }
    }
  }
  "saveChallengeJournal": {
    path: "/api/v1/challenges/{id}/journals/{date}"
    method: "PUT"
    parameters: {
      "path:id": {
        name: "id"
        in: "path"
        required: true
        schema: string
      }
      "path:date": {
        name: "date"
        in: "path"
        required: true
        schema: string
      }
    }
    requestBody: {
      required: true
      content: {
        "application/json": {
      "command_id": string
      "data_epoch": number
      "base_version": number
      "journal": string
    }
      }
    }
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["JournalMutationResult"]
        }
      }
      "401": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "403": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "404": {
        content: {
          "application/json": components['schemas']["ApiError"]
        }
      }
      "409": {
        content: {
          "application/problem+json": components['schemas']["JournalProblemDetails"]
        }
      }
      "422": {
        content: {
          "application/json": components['schemas']["ValidationError"]
        }
      }
      "423": {
        content: {
          "application/problem+json": components['schemas']["StateProblemDetails"]
        }
      }
    }
  }
}
