// Generated from contracts/openapi.yaml. Do not edit directly.

export interface components {
  schemas: {
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
      "redirect_to"?: string
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
}
