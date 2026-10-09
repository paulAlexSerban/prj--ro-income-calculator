# Offer Compare RO docs

These notes describe the system as it is built. [README.md](../README.md) at the repository root is the short guide for running it.

| Folder | What it is |
| --- | --- |
| [requirements](requirements/functional.md) | What the app does ([functional](requirements/functional.md), [non-functional](requirements/non-functional.md)). |
| [architecture](architecture/overview.md) | How the Compose stack, the API, and the engine fit together. [Data model](architecture/data-model.md). [Calculation flow](architecture/calculation-flow.md). |
| [adrs](adrs/0001-postgres-and-fastify.md) | Decisions that are already accepted: Postgres and Fastify, the pure engine, database tax rules, row-level security, BNR rates. |
| [spikes](spikes/001-cas-cass-tier-model.md) | Investigations that are finished: the CAS/CASS tier assumption, the BNR XML host, and the net-to-gross solver. |

Tax amounts in the seed data are not a statement of Romanian law. They stay unverified until someone checks them against ANAF / Codul Fiscal and marks the rule verified in Settings.
