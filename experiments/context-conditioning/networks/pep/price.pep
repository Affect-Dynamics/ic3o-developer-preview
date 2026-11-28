Price order

Intake
    quantity: number
    unit_price: number
    ctx_coefficient: number
    ctx_handling_rate: number
    ctx_rebate: number

Capability
    base = scale.capability(quantity, unit_price)
    adjusted = scale.capability(base, ctx_coefficient)
    handling = scale.capability(quantity, ctx_handling_rate)
    total = reduce.capability(adjusted, ctx_rebate)

Outtake
    total: number
    handling: number
    quantity: number
