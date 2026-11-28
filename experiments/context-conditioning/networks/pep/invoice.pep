Invoice order

Intake
    total: number
    ctx_deposit: number

Capability
    due = reduce.capability(total, ctx_deposit)

Outtake
    due: number
    total: number
