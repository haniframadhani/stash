---
type: browser
generated: { by: process:guren-browser-map }
---

# drive

## Routes

<!-- guren:browser routes -->
| Method | Path | Name | Middleware | Page |
| --- | --- | --- | --- | --- |
| GET | /files | drive.index |  |  |
| GET | /files/:folderId | drive.folder |  |  |
| GET | /recent | drive.recent |  | drive/Recent |
| GET | /starred | drive.starred |  | drive/Starred |
| GET | /trash | drive.trash |  | drive/Trash |
<!-- /guren:browser routes -->

## How to reach it

<!-- guren:browser reach -->
Landmark: `GET /recent` (drive.recent), rendering `drive/Recent`.
No middleware on the landmark.

Middleware lists may be incomplete: Could not fully read usesMiddleware: inline-middleware.
<!-- /guren:browser reach -->

## Plan

<!-- guren:browser plan -->
None: no approved plan covers these routes. Outcomes are not inferred from names.
<!-- /guren:browser plan -->

## Charters

One line per area to explore: one area, one posture, one sentence.

- folder CRUD and navigation — happy path plus the refusals: empty/invalid name, unknown id (404), cycle errors on move; folder rows persist on the local database between runs.
- rename — inline rename through the ⋮ menu and F2, the sibling-clash error, and the old permanent URL still serving the image afterwards; images persist on the local database between runs.

## Gotchas

What reads as broken here but is not, and what the local app cannot do.
