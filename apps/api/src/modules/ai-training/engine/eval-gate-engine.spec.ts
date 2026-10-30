  it('fingerprints content: key-order independent, version-insensitive, case-order and criteria sensitive', () => {
    const a = defineEvalSuite(SUITE);
    expect(a.ok).toBe(true);
    const fp1 = valueOf(suiteFingerprint(valueOf(a)));
    const fp2 = valueOf(
      suiteFingerprint({
        kind: 'forge',
        cases: [
          { weight: 2, criteria: ['compiles', 'tests-pass'], id: 'fix1' },
          { criteria: ['severity', 'tone'], id: 'rev1' },
        ],
        version: 1,
        id: 'forge-core',
      }),
    );
    expect(fp2).toBe(fp1);
    // version is metadata, NOT content: same content, higher version, same fingerprint
    const fp3 = valueOf(suiteFingerprint({ ...valueOf(a), version: 2 }));
    expect(fp3).toBe(fp1);
    // case order is content
    const fp4 = valueOf(suiteFingerprint({ ...valueOf(a), cases: [REV1, FIX1] }));
    expect(fp4).not.toBe(fp1);
    // criteria are content
    const fp5 = valueOf(
      suiteFingerprint({ ...valueOf(a), cases: [{ ...FIX1, criteria: ['compiles'] }, REV1] }),
    );
    expect(fp5).not.toBe(fp1);
  });