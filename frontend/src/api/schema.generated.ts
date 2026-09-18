// Generated from contracts/openapi.yaml. Do not edit directly.

export interface components {
  schemas: {
    "FoundationHealth": {
      "status": "ok"
      "service": "noteflow-api"
    }
  }
}

export interface operations {
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
