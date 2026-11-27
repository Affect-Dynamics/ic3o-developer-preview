Allocate stock

Intake
    requested: integer
    available: integer
    unit_price: integer

Capability
    allocation = minimum.capability(requested, available)

Outtake
    allocation: integer
    unit_price: integer
    requested: integer
