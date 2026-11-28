Execution admission

Use
    provenance

Intake
    principal: text
    authorized: integer
    request: text

Capability
    commitment = provenance:sha256.capability(request)

Outtake
    commitment: text
