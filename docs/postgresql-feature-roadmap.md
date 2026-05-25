# PostgreSQL Feature Roadmap

This document tracks PostgreSQL-specific capability coverage in DataSmith.
Update the checklist whenever a feature is completed, adjusted, or intentionally deferred.

## Usage

- Mark completed items with `[x]`
- Keep in-progress or planned items as `[ ]`
- If a feature is intentionally deferred, add a short note under the item

## Already Supported

- [x] Connection, reconnect, and health monitoring
- [x] SQL editor execution, cancellation, and `EXPLAIN`
- [x] `search_path` read and write
- [x] Database / schema / table / view tree browsing
- [x] Table data browsing
- [x] Table structure browsing
- [x] Table designer for columns / indexes / foreign keys
- [x] Table DDL viewing
- [x] View definition viewing
- [x] Index browsing and index definition copying
- [x] Foreign key browsing and definition copying
- [x] Trigger browsing, definition viewing, and drop
- [x] Rule browsing, definition viewing, and drop
- [x] Constraint browsing, definition viewing, and drop
- [x] Function browsing
- [x] Procedure browsing
- [x] Aggregate browsing
- [x] Function / procedure / aggregate definition viewing
- [x] Function / procedure / aggregate signature copying
- [x] Extension browsing
- [x] Common database tree context menu actions
- [x] Sequence support
  - Browse sequences in the object tree
  - View sequence definition
  - Copy sequence definition
  - View sequence state
  - Set next value with `setval`
  - Restart sequence from start value
  - Rename sequence
  - Drop sequence
- [x] Materialized view support
  - Browse materialized views in the object tree
  - View definition
  - Refresh materialized view
- [x] More accurate routine call SQL generation
  - Distinguish scalar functions, set-returning functions, procedures, and aggregates
  - Avoid generic placeholder SQL that is semantically wrong
- [x] Rich PostgreSQL index metadata
  - Expression indexes
  - Partial indexes
  - Included columns
  - Sort direction and null ordering

## Recommended Next

- [ ] Partitioned table support
  - Distinguish partitioned tables from regular tables
  - Show partition key and child partitions

## Important Gaps

- [ ] Enum type support
- [ ] Domain type support
- [ ] Composite type support
- [ ] Row-level security policy support
- [ ] Publication support
- [ ] Subscription support
- [ ] Schema DDL management
  - Create schema
  - Rename schema
  - Drop schema
  - Show schema owner and comment more completely

- [ ] Better trigger / rule / constraint SQL generation
- [ ] Better PostgreSQL plan visualization for `EXPLAIN ANALYZE`

## Nice To Have

- [ ] Role and privilege inspection
- [ ] Grant display on database objects
- [ ] Extension install / uninstall actions
- [ ] Maintenance actions
  - `VACUUM`
  - `ANALYZE`
  - `REINDEX`

- [ ] Session / lock / blocking inspection
  - `pg_stat_activity`
  - lock wait visibility
  - blocking session identification

- [ ] PostgreSQL server settings browser
  - current value
  - source
  - unit
  - context

## Notes

- Keep this roadmap pragmatic. Lightweight usability comes first.
- Prioritize features that fit the existing object tree and metadata architecture.
- Prefer native PostgreSQL definitions and catalog sources over frontend string assembly whenever possible.
