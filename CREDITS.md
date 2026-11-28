# Credits and licences

Policy: only assets whose licence allows the use made of them; anything that may not be redistributed is loaded from its provider, never committed ([design doc §9](docs/3-design/04-design.md#9-licensing-policy)).

| Asset                           | Author / source                    | Licence                                     | How it is used                              |
| ------------------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Plus Jakarta Sans               | Tokotype, via Google Fonts         | SIL OFL 1.1                                 | Self-hosted with `next/font`                |
| JetBrains Mono                  | JetBrains, via Google Fonts        | SIL OFL 1.1                                 | Self-hosted with `next/font`                |
| Cabinet Grotesk                 | Indian Type Foundry, via Fontshare | ITF Free Font Licence (no redistribution)   | Loaded from the Fontshare CDN only          |
| shadcn/ui components            | shadcn                             | MIT                                         | Copied into `src/components/ui`             |
| Radix UI                        | WorkOS                             | MIT                                         | npm dependency (dialogs, labels)            |
| Lucide icons                    | Lucide contributors                | ISC                                         | npm dependency                              |
| Recharts                        | Recharts group                     | MIT                                         | npm dependency (dashboard charts)           |
| FullCalendar 7                  | Adam Shaw                          | MIT                                         | npm dependency (calendar)                   |
| temporal-polyfill               | FullCalendar                       | MIT                                         | npm dependency (FullCalendar time)          |
| axe-core / @axe-core/playwright | Deque Systems                      | MPL-2.0                                     | Dev dependency (accessibility tests)        |
| gpt-oss-20b, gpt-oss-120b       | OpenAI, served by Groq             | Apache-2.0 (weights); Groq terms of service | Called over the Groq API; not redistributed |
| Sounds                          | Own work (Web Audio tones)         | —                                           | Generated in the browser; no files          |
