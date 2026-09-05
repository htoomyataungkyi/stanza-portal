# P2 verification

Changes build on P1 commit c1fce73. No database schema or permission changes are required.

- Membership restoration uses an upsert on the existing project/user primary key, clears revocation and checks the returned row.
- Updates transmit empty text and null optional dates; inserts preserve database defaults. A required upload date cannot be silently cleared. Client approval updates still send only decision/comment.
- Client View blocks write actions and uploads, hides project creation and administrative pages, and filters internal finance summaries. P1 role guards remain in place.
- Failed project reads display a named error and Retry instead of empty records. Access-list errors have their own retry. Older project requests cannot overwrite a later selection.
- PDF links are refreshed when expired or within one minute of expiry. Signing failures display feedback; deleted files are not previewed.
- Partially Paid and Overdue display warning and danger status respectively.

Verification:

```sh
node --check app.js
node tests/p1-security.test.cjs
node tests/p2-regression.test.cjs
```

P1: 1,458 permission assertions plus modal/preview/disabled-login checks pass.
P2: 47 regression checks pass, including simulated network failures, out-of-order responses, stale signed URLs and blocked preview mutations.

`p2-database.sql` was executed against the linked production database inside a transaction. It verifies regranting membership, blank text/optional date updates and insert defaults using synthetic records; all records are rolled back. It sends no authentication emails and changes no schema.

These are database and simulated application regression tests, not a real-client authenticated browser test. Real client records were not changed. Previously issued signed URLs retain their original expiry.

Rollback: revert the P2 application commit; P1 database protection remains in place.
