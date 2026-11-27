Mode-based order allocation

Use
    commerce

Intake
    source: POST /api/run
    requested: integer
    available: integer
    unit_price: integer

Context
    commerce:order.context

Contract
    commerce:order.contract

Capability
    allocation = allocation.pep(requested, available)
    total = numerical:multiply.capability(allocation, unit_price)
    remaining = subtract.capability(available, allocation)

Outtake
    allocation: integer
    total: integer
    remaining: integer
    allocation -> response
    total -> response
    remaining -> inventory_preview
