# vendor (TEMPORARY)

`ecotech-contracts-0.1.0.tgz` is a local `npm pack` of `@ecotech/contracts` 0.1.0 from
`EcoFin-API/packages/contracts` (D26). It exists only so this branch installs without a token
and without any `../` path before the first publish to GitHub Packages.

**Before merging to `main`:** publish the package (push the tag `contracts-v0.1.0` in EcoFin-API),
change `package.json` to `"@ecotech/contracts": "0.1.0"`, run `npm install` with `NPM_TOKEN` set,
commit the lockfile, and delete this folder (and the `vendor` line in `.prettierignore`).
Whenever the contracts change before then, re-run `npm pack` there and replace the tarball.
