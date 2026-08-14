// Unit tests must not read approved facts from whichever database invokes the gate.
delete process.env.DATABASE_URL;
