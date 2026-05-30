# Default Avatar License

**File:** `default-avatar.vrm`

**License:** CC0 1.0 Universal (Public Domain Dedication)

**Source / Attribution:** None required. The default avatar is generated
procedurally by `scripts/generate-default-vrm.mjs` and contains no third-party
art assets. It is a simple blocky humanoid mannequin (VRM 0.x) with a full
humanoid bone hierarchy, per-bone box geometry, and a `Blink` blendshape.

To regenerate the asset:

```bash
node scripts/generate-default-vrm.mjs
```

Because the geometry is authored in-repo and dedicated to the public domain
under CC0, it may be shipped, modified, and redistributed without restriction.
