Bounded allocation

Intake
    requested: integer
    available: integer

Context
    order.context
    allocation.context

Capability
    allocation = minimum.capability(requested, available)

Outtake
    allocation: integer
