// Generated from contracts/openapi.yaml. Do not edit directly.

export interface components {
  schemas: {
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
    "ProblemDetails": {
      "message": string
      "code": "version_conflict" | "stale_data_epoch" | "idempotency_key_reused" | "write_fence_active"
      "resource_id"?: string
      "current_version"?: number
      "current_snapshot"?: components['schemas']["ChallengeSnapshot"]
    }
  }
}

export interface operations {
  "loginOwner": {
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
    responses: {
      "200": {
        content: {
          "application/json": components['schemas']["FoundationHealth"]
        }
      }
    }
  }
  "getAccountContext": {
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
          "application/problem+json": components['schemas']["ProblemDetails"]
        }
      }
      "422": {
        content: {
          "application/json": components['schemas']["ValidationError"]
        }
      }
      "423": {
        content: {
          "application/problem+json": components['schemas']["ProblemDetails"]
        }
      }
    }
  }
  "getChallenge": {
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
          "application/problem+json": components['schemas']["ProblemDetails"]
        }
      }
      "422": {
        content: {
          "application/json": components['schemas']["ValidationError"]
        }
      }
      "423": {
        content: {
          "application/problem+json": components['schemas']["ProblemDetails"]
        }
      }
    }
  }
}
