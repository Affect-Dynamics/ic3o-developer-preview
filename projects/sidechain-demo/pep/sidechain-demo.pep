Order allocation
Use
    provenance

Sidechain
    provenance:provenance.pep

Context
    order.context

Contract
    order.contract

Intake
    source: POST /api/run
    requested: integer
    available: integer
    unit_price: integer

Capability
    allocation = allocation.pep(requested, available)
    total = multiply.capability(allocation, unit_price)
    remaining = subtract.capability(available, allocation)

Outtake
    allocation: integer
    total: integer
    remaining: integer
