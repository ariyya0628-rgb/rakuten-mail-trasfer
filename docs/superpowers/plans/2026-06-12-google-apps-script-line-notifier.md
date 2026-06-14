# Google Apps Script LINE Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PC-free Google Apps Script version that checks Gmail for Rakuten order confirmation emails, extracts product details, and sends them to LINE.

**Architecture:** Google Apps Script will run on Google's servers with a time-based trigger. It uses GmailApp to search order emails, PropertiesService to store the LINE token and processed Gmail message IDs, and UrlFetchApp to call the LINE Messaging API broadcast endpoint.

**Tech Stack:** Google Apps Script, GmailApp, PropertiesService, ScriptApp triggers, LINE Messaging API broadcast endpoint.

---

### Task 1: Create Apps Script Source

**Files:**
- Create: `apps_script/Code.gs`

- [ ] **Step 1: Add Gmail search and LINE notification code**

Create a single Apps Script file with:

```javascript
const CONFIG = {
  gmailQuery: 'from:order@rakuten.co.jp subject:"【楽天市場】注文内容ご確認（自動配信メール）" newer_than:14d',
  lineEndpoint: 'https://api.line.me/v2/bot/message/broadcast',
  lineTokenProperty: 'LINE_CHANNEL_ACCESS_TOKEN',
  processedProperty: 'PROCESSED_MESSAGE_IDS',
  messagePrefix: '楽天 注文商品',
  maxThreads: 20
};
```

The main function is `notifyRakutenOrders()`. It searches Gmail, skips message IDs already saved in script properties, extracts `[商品]` blocks, sends a LINE broadcast, and saves processed IDs after successful notification.

- [ ] **Step 2: Add setup helpers**

Add `setLineToken()`, `setupTrigger()`, `deleteTriggers()`, and `testParser()` so the user can configure and verify the script from Apps Script.

### Task 2: Create Setup Guide

**Files:**
- Create: `apps_script/README.md`

- [ ] **Step 1: Document setup**

Write step-by-step Japanese instructions:

1. Open Google Apps Script.
2. Create a new project.
3. Paste `Code.gs`.
4. Set the LINE channel access token in `setLineToken()`.
5. Run `setLineToken()` once.
6. Run `testParser()`.
7. Run `notifyRakutenOrders()` once and approve Gmail/UrlFetch permissions.
8. Run `setupTrigger()` to execute every 5 minutes.

- [ ] **Step 2: Document behavior**

Explain that the PC can be off, duplicate notifications are prevented, and the LINE Official Account currently broadcasts to all friends.

### Task 3: Verify Locally

**Files:**
- Verify: `apps_script/Code.gs`
- Verify: `apps_script/README.md`

- [ ] **Step 1: Run a local JavaScript parser check**

Use Node.js to evaluate the extraction logic against the user's sample mail body.

- [ ] **Step 2: Review for secrets**

Confirm no LINE token, Google token, or Gmail credential is written into tracked files.
