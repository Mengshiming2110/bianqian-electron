# Mail Detail Task Brief Design

## Purpose

The mail detail page should help the user start label-making work quickly after opening a shipment email. It is not primarily a mail reader. The first screen should answer the operational questions:

- Which customer is this shipment for?
- Which date is the shipment scheduled for?
- Which sales owner or responsible person should be contacted after labels are made?
- Are there special notes in the mail body, such as extra outer-box labels, BU naming, stamping, packing, or printing instructions?
- What material row should be processed now, and what values should be copied into the label system?

## User Workflow

1. Open a shipment mail from the mail tab.
2. Read the task brief at the top: customer, shipment date, sales owner, and special notes if any.
3. Process one material row at a time.
4. Click field values to copy plain text into the label system.
5. Move to the next or previous material until all rows are handled.

## Layout

The detail panel uses a "task brief plus material card" structure.

### Header

The header shows a compact task title and a small original-mail entry.

- Title: `出货任务` or a concise shipment title when an order number is available.
- Metadata: sender and received time.
- Action: `原文` or equivalent entry for viewing the original mail content.

The original-mail entry is present for checking source content, but it is secondary. It should not dominate the first screen.

### Task Brief

The task brief appears before the material card.

Required fields:

- 出货客户
- 出货日期
- 销售负责人

Sales owner extraction:

- The sales owner is extracted from the email body or table fields.
- If no sales owner is found, show a low-emphasis fallback: `负责人待确认`.
- The fallback remains visible because responsibility handoff is part of the work loop.

Special notes:

- Show a `注意事项` module only when special notes are automatically extracted.
- If no special notes are extracted, do not render the module and do not reserve space for it.
- Notes should focus on operational instructions outside normal table fields, including extra labels, BU naming, stamping, packing, printing, or delivery-document requirements.

### Material Card

The material area shows one material row per page.

Required fields:

- APN
- OEM PN
- LY PN
- 数量
- Config
- 备注

Navigation:

- Show current progress, such as `第 1 / 8 款`.
- Provide `上一款` and `下一款`.
- Disable previous or next controls at the ends.

The material card is the main working surface after the task brief. It should be dense enough for repeated work, but not so compressed that field values are hard to scan.

## Copy Interaction

The field value itself is the copy target.

- Field labels are plain, quiet text.
- Only the value part is clickable.
- Clicking a value copies only that value as plain text.
- Do not copy the field label.
- Do not use underline styling.
- Use color, weight, cursor, and subtle hover background to communicate that the value is clickable.
- After copying, show a lightweight confirmation such as `已复制 OEM PN`.

Example:

```text
APN      810-30095
OEM PN   810-30095SLY02TONB
LY PN    882-AKZ805-02-00
数量     5120
Config   CxB: Black7, PVD (NF)
备注     标签 vendor code 1000248
```

In this example, only the right-side values are clickable.

## Extraction Rules

The page should continue extracting material data from the email table by matching table headers. The task brief adds extraction from both the table and the body.

Customer:

- Prefer table headers such as `出货客户` and `客户`.
- Fall back to body text only when table extraction fails.

Shipment date:

- Prefer table headers such as `出货时间`, `发货日期`, `送货日期`, or `交货日期`.
- Normalize dates to a consistent display format.

Sales owner:

- Extract from body or table fields related to sales ownership or responsibility.
- Candidate labels include sales owner, sales, business owner, PM, BU, responsible person, or local Chinese equivalents found in the mail content.
- If multiple candidates are found, prefer the one closest to ownership language rather than copied-recipient lists.

Special notes:

- Extract concise body instructions that are not normal material rows.
- Ignore email signatures, recipient lists, repeated reply headers, and table cell noise.
- Do not display the notes module when the extracted result is empty.

Material rows:

- Each table data row becomes one material page.
- Values are read by header lookup, not by hardcoded column positions.
- Quantity copied to the clipboard should be plain numeric text when possible, such as `5120`, not `5,120 件`, unless the original meaningful value is non-numeric.

## Error And Edge Cases

- If no shipment table is recognized, fall back to showing the sanitized original mail detail.
- If a required material value is missing, show `待确认` as the value and do not make that placeholder feel like a successful copied value.
- If sales owner is missing, show `负责人待确认` in a low-emphasis style.
- If special notes are missing, hide the notes module.
- If copy fails, show a subtle failure message and keep the user on the same material page.

## Visual Direction

The page should feel like a compact business tool, not a marketing card.

- Use restrained spacing and clear information hierarchy.
- Avoid decorative copy, oversized headings, and unnecessary explanation text.
- Values that can be copied should stand out through color and weight, not button chrome.
- Cards should have small radii consistent with the rest of the app.
- Keep the interaction quiet: the user should be able to repeat copy actions quickly without visual noise.

## Testing

Implementation should be verified with:

- A shipment email with multiple material rows.
- A shipment email with special notes in the body.
- A shipment email without special notes.
- A shipment email with sales owner present.
- A shipment email without sales owner.
- Copying each material field value and confirming the clipboard contains only the plain value.
- Navigating previous and next material pages without losing the selected mail.

