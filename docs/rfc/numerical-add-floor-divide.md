# Numerical addition and floor division

Proposed expansion of the existing numerical Mode. No new Mode or runtime plugin mechanism.

- add: two safe integers, exact sum, reject overflow.
- floor-divide: two safe integers, mathematical floor of the quotient, reject zero divisor.
- Both are pure, synchronous and deterministic. BigInt intermediates avoid floating-point rounding.

The freight construction benchmark motivated these reusable operations. This contribution does not add literal capability bindings, automatic routing, or general compound expressions. Tests invoke the actual runtime through Mode-qualified definitions. Application acceptance and MCP integration remain separate follow-up checks.
