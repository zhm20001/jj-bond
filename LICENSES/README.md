# Bundled third-party license texts

manifest.json maps each dependency and version to original license/notice texts
in texts/, with SHA-256 checksums and source references. Identical texts are
stored once. Original whitespace and line endings are preserved.

Scope: all 473 Cargo dependencies in the lockfile (including build and
platform-specific dependencies), plus all six npm production dependencies.
This is deliberately broader than the macOS runtime dependency set.

Most texts come from published package archives. Missing files were retrieved
from upstream revisions recorded in the crate's .cargo_vcs_info.json. The winapi
import-library packages use the texts distributed with their winapi parent.
r-efi's AUTHORS file contains its MIT license and copyright notices. The
selectors MPL text comes from Mozilla; its unmodified source is linked.

Each package's source URL identifies its version-pinned source archive,
including MPL-2.0 packages. Dependencies have not been modified by jj-bond.
Package-specific notices and exceptions are retained alongside license texts.
This collection does not relicense dependencies under the project license.

Run `node scripts/verify-licenses.mjs` after dependency changes. Update the
manifest and source texts together; the check rejects missing packages, empty
text lists and checksum mismatches. Do not substitute a generic license for a
package's copyright notice.
