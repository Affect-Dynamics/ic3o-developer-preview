Partial allocation

Intake
    quantity: integer
    requested: integer
    unit_price: integer

Capability
    total = multiply.capability(quantity, unit_price)
    shortfall = subtract.capability(requested, quantity)

Outtake
    total: integer
    shortfall: integer
