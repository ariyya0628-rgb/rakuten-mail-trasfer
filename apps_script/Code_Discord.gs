const CONFIG = {
  gmailQuery: 'from:order@rakuten.co.jp subject:"\u3010\u697d\u5929\u5e02\u5834\u3011\u6ce8\u6587\u5185\u5bb9\u3054\u78ba\u8a8d\uff08\u81ea\u52d5\u914d\u4fe1\u30e1\u30fc\u30eb\uff09" newer_than:3d',
  discordWebhookProperty: 'DISCORD_WEBHOOK_URL',
  processedPropertyPrefix: 'DISCORD_PROCESSED_ORDER_KEYS_',
  processedChunkSize: 200,
  processedChunkCountProperty: 'DISCORD_PROCESSED_ORDER_KEYS_CHUNK_COUNT',
  targetLabelName: '\u697d\u5929/Discord\u901a\u77e5\u5bfe\u8c61',
  notifiedLabelName: '\u697d\u5929/Discord\u901a\u77e5\u6e08\u307f',
  failedLabelName: '\u697d\u5929/Discord\u901a\u77e5\u5931\u6557',
  messagePrefix: '\u697d\u5929 \u6ce8\u6587\u5546\u54c1',
  maxThreads: 20,
  maxProcessedOrderKeys: 3000,
  startAfterProperty: 'DISCORD_START_AFTER',
  backfillLookbackDays: 3,
  discordMaxMessageLength: 1800,
  discordBatchDelayMs: 2500
};

function notifyRakutenOrdersToDiscord() {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = properties.getProperty(CONFIG.discordWebhookProperty);
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is not set.');
  }

  const startAfter = properties.getProperty(CONFIG.startAfterProperty);
  if (!startAfter) {
    throw new Error('DISCORD_START_AFTER is not set. Run initializeDiscordNotifier first.');
  }

  sendUnnotifiedOrdersToDiscord_(new Date(startAfter), false);
}

function sendLast3DaysUnnotifiedToDiscord() {
  const cutoff = new Date(Date.now() - CONFIG.backfillLookbackDays * 24 * 60 * 60 * 1000);
  sendUnnotifiedOrdersToDiscord_(cutoff, true);

  const properties = PropertiesService.getScriptProperties();
  properties.setProperty(CONFIG.startAfterProperty, new Date().toISOString());
  console.log('[OK] startAfter set for future automatic notifications: ' + properties.getProperty(CONFIG.startAfterProperty));
}

function sendUnnotifiedOrdersToDiscord_(cutoffDate, compactDigest) {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = properties.getProperty(CONFIG.discordWebhookProperty);
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is not set.');
  }

  const processedKeys = loadProcessedKeys_(properties);
  const threads = GmailApp.search(CONFIG.gmailQuery, 0, CONFIG.maxThreads);
  const targetLabel = getOrCreateLabel_(CONFIG.targetLabelName);
  const notifiedLabel = getOrCreateLabel_(CONFIG.notifiedLabelName);
  const failedLabel = getOrCreateLabel_(CONFIG.failedLabelName);
  const pendingOrders = [];
  let notifiedCount = 0;

  threads.forEach(function (thread) {
    targetLabel.addToThread(thread);

    thread.getMessages().forEach(function (message) {
      if (message.getDate().getTime() < cutoffDate.getTime()) {
        return;
      }

      const messageId = message.getId();
      const body = getMessageText_(message);
      const order = parseOrderEmail_(body);
      const processedKey = buildProcessedKey_(order, messageId);

      if (processedKeys[processedKey]) {
        return;
      }

      pendingOrders.push({
        message: message,
        messageId: messageId,
        order: order,
        processedKey: processedKey
      });
    });
  });

  pendingOrders.sort(function (a, b) {
    return a.message.getDate().getTime() - b.message.getDate().getTime();
  });

  const batches = compactDigest ? buildDiscordDigestBatches_(pendingOrders) : buildDiscordBatches_(pendingOrders);

  batches.forEach(function (batch, index) {
    try {
      sendDiscordMessage_(webhookUrl, batch.content);

      batch.items.forEach(function (pending) {
        pending.message.getThread().addLabel(notifiedLabel);
        processedKeys[pending.processedKey] = true;
        notifiedCount += 1;
        console.log('[OK] Discord sent: ' + (pending.order.orderNumber || pending.messageId) + ' / ' + pending.message.getDate());
      });

      if (index < batches.length - 1) {
        Utilities.sleep(CONFIG.discordBatchDelayMs);
      }
    } catch (error) {
      batch.items.forEach(function (pending) {
        pending.message.getThread().addLabel(failedLabel);
      });
      console.log('[ERROR] Discord batch failed: ' + batch.items.length + ' orders / ' + error);
    }
  });

  saveProcessedKeys_(properties, processedKeys);
  console.log('[INFO] candidates: ' + pendingOrders.length + ' / notified: ' + notifiedCount);
}

function buildDiscordBatches_(pendingOrders) {
  const batches = [];
  let currentContent = '';
  let currentItems = [];

  pendingOrders.forEach(function (pending) {
    if (pending.order.products.length === 0) {
      console.log('[SKIP] product block not found: ' + pending.messageId);
      return;
    }

    const content = formatDiscordMessage_(pending.order);
    const separator = currentContent ? '\n\n---\n\n' : '';

    if (currentContent && (currentContent + separator + content).length > CONFIG.discordMaxMessageLength) {
      batches.push({
        content: currentContent,
        items: currentItems
      });
      currentContent = content;
      currentItems = [pending];
      return;
    }

    currentContent += separator + content;
    currentItems.push(pending);
  });

  if (currentContent) {
    batches.push({
      content: currentContent,
      items: currentItems
    });
  }

  console.log('[INFO] Discord batches: ' + batches.length);
  return batches;
}

function buildDiscordDigestBatches_(pendingOrders) {
  const validOrders = pendingOrders.filter(function (pending) {
    if (pending.order.products.length === 0) {
      console.log('[SKIP] product block not found: ' + pending.messageId);
      return false;
    }
    return true;
  });

  const header = '**' + CONFIG.messagePrefix + '\uff08\u672a\u901a\u77e5\u307e\u3068\u3081\uff09**\n';
  const batches = [];
  let currentContent = header;
  let currentItems = [];

  validOrders.forEach(function (pending, index) {
    const line = formatDiscordDigestLine_(pending.order, index + 1);

    if (currentItems.length > 0 && (currentContent + '\n' + line).length > CONFIG.discordMaxMessageLength) {
      batches.push({
        content: currentContent,
        items: currentItems
      });
      currentContent = header + line;
      currentItems = [pending];
      return;
    }

    currentContent += (currentItems.length === 0 ? '' : '\n') + line;
    currentItems.push(pending);
  });

  if (currentItems.length > 0) {
    batches.push({
      content: currentContent,
      items: currentItems
    });
  }

  console.log('[INFO] Discord digest batches: ' + batches.length);
  return batches;
}

function initializeDiscordNotifier() {
  const properties = PropertiesService.getScriptProperties();
  const processedKeys = loadProcessedKeys_(properties);
  const threads = GmailApp.search(CONFIG.gmailQuery, 0, CONFIG.maxThreads);
  const targetLabel = getOrCreateLabel_(CONFIG.targetLabelName);
  let markedCount = 0;

  threads.forEach(function (thread) {
    targetLabel.addToThread(thread);

    thread.getMessages().forEach(function (message) {
      const body = getMessageText_(message);
      const order = parseOrderEmail_(body);
      const processedKey = buildProcessedKey_(order, message.getId());
      if (!processedKeys[processedKey]) {
        processedKeys[processedKey] = true;
        markedCount += 1;
      }
    });
  });

  properties.setProperty(CONFIG.startAfterProperty, new Date().toISOString());
  saveProcessedKeys_(properties, processedKeys);
  console.log('[OK] existing orders marked as processed: ' + markedCount);
  console.log('[OK] startAfter: ' + properties.getProperty(CONFIG.startAfterProperty));
}

function setupDiscordTrigger() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty(CONFIG.startAfterProperty)) {
    properties.setProperty(CONFIG.startAfterProperty, new Date().toISOString());
    console.log('[OK] startAfter initialized: ' + properties.getProperty(CONFIG.startAfterProperty));
  }

  deleteDiscordTriggers();
  ScriptApp.newTrigger('notifyRakutenOrdersToDiscord')
    .timeBased()
    .everyMinutes(5)
    .create();
  console.log('[OK] Discord trigger created: every 5 minutes.');
}

function deleteDiscordTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'notifyRakutenOrdersToDiscord') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  console.log('[OK] Discord triggers deleted.');
}

function testDiscordParserOnly() {
  const sample = [
    '[\u5546\u54c1]',
    'PH PandaHall 2\u672c\u5165\u308a \u30a2\u30eb\u30df\u30cb\u30a6\u30e0 \u4ea4\u63db\u7528 \u30c1\u30a7\u30fc\u30f3 20cm\u9577\u3055 \u30c1\u30a7\u30fc\u30f3\u30d9\u30eb\u30c8(20221021181952)',
    'SKU\u7ba1\u7406\u756a\u53f7:normal-inventory',
    '\u4fa1\u683c  1,315(\u5186) x 1(\u500b) = 1,315(\u5186) \u203b10%\u7a0e\u8fbc',
    '*********************************************************************',
    '\u9001\u6599\u8a08      0(\u5186)',
    '[\u53d7\u6ce8\u756a\u53f7] 402853-20260612-0000000000',
    '[\u65e5\u6642]     2026-06-12 13:47:00'
  ].join('\n');

  const order = parseOrderEmail_(sample);
  console.log(formatDiscordMessage_(order));
}

function debugRecentRakutenOrders() {
  const properties = PropertiesService.getScriptProperties();
  const processedKeys = loadProcessedKeys_(properties);
  const threads = GmailApp.search(CONFIG.gmailQuery, 0, CONFIG.maxThreads);
  let messageCount = 0;

  console.log('[DEBUG] query: ' + CONFIG.gmailQuery);
  console.log('[DEBUG] threads: ' + threads.length);
  console.log('[DEBUG] startAfter: ' + (properties.getProperty(CONFIG.startAfterProperty) || '(not set)'));

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      const body = getMessageText_(message);
      const order = parseOrderEmail_(body);
      const processedKey = buildProcessedKey_(order, message.getId());
      messageCount += 1;

      console.log([
        '[DEBUG]',
        message.getDate(),
        'from=' + message.getFrom(),
        'subject=' + message.getSubject(),
        'order=' + (order.orderNumber || '(none)'),
        'products=' + order.products.length,
        'processed=' + Boolean(processedKeys[processedKey])
      ].join(' / '));
    });
  });

  console.log('[DEBUG] messages: ' + messageCount);
}

function testDiscordWebhookOnly() {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = properties.getProperty(CONFIG.discordWebhookProperty);
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is not set.');
  }

  sendDiscordMessage_(webhookUrl, '\u697d\u5929\u6ce8\u6587\u901a\u77e5\u306eDiscord\u63a5\u7d9a\u30c6\u30b9\u30c8\u3067\u3059\u3002');
  console.log('[OK] Discord webhook test sent.');
}

function debugDiscordSettings() {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = properties.getProperty(CONFIG.discordWebhookProperty) || '';

  console.log('[DEBUG] property name: ' + CONFIG.discordWebhookProperty);
  console.log('[DEBUG] webhook exists: ' + Boolean(webhookUrl));
  console.log('[DEBUG] webhook length: ' + webhookUrl.length);
  console.log('[DEBUG] webhook starts with discord url: ' + /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(webhookUrl));

  if (webhookUrl) {
    console.log('[DEBUG] webhook preview: ' + webhookUrl.slice(0, 35) + '...');
  }
}

function sendDiscordMessage_(webhookUrl, content) {
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      content: content,
      allowed_mentions: {
        parse: []
      }
    }),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  console.log('[DEBUG] Discord response status: ' + statusCode);
  console.log('[DEBUG] Discord response body: ' + response.getContentText());

  if (statusCode >= 400) {
    throw new Error('Discord send error: ' + statusCode + ' ' + response.getContentText());
  }
}

function getMessageText_(message) {
  const plainBody = message.getPlainBody();
  if (plainBody) {
    return plainBody;
  }

  return stripHtml_(message.getBody());
}

function parseOrderEmail_(text) {
  return {
    orderNumber: findFirst_(text, /\[\u53d7\u6ce8\u756a\u53f7\]\s*([^\n\r]+)/),
    orderedAt: findFirst_(text, /\[\u65e5\u6642\]\s*([^\n\r]+)/),
    products: parseProducts_(extractProductBlock_(text))
  };
}

function extractProductBlock_(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const match = normalized.match(/\[\u5546\u54c1\]\s*([\s\S]*?)(?:\n\*{10,}|\n\u9001\u6599\u8a08|\n\u652f\u6255\u3044\u91d1\u984d|\n\[\u53d7\u6ce8\u756a\u53f7\])/);
  return match ? match[1].trim() : '';
}

function parseProducts_(productBlock) {
  const products = [];
  let nameLines = [];
  let options = [];

  String(productBlock || '').split('\n').forEach(function (rawLine) {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    if (line.indexOf('\u4fa1\u683c') === 0) {
      if (nameLines.length > 0) {
        products.push({
          name: nameLines.join(' ').trim(),
          options: options.slice(),
          price: line.replace(/\s+/g, ' ')
        });
      }
      nameLines = [];
      options = [];
      return;
    }

    if (/^(SKU\u7ba1\u7406\u756a\u53f7|\u30b5\u30a4\u30ba|\u30ab\u30e9\u30fc|\u8272|\u6570\u91cf)/.test(line)) {
      options.push(line);
      return;
    }

    nameLines.push(line);
  });

  if (nameLines.length > 0) {
    products.push({
      name: nameLines.join(' ').trim(),
      options: options.slice(),
      price: ''
    });
  }

  return products;
}

function formatDiscordMessage_(order) {
  const lines = ['**' + CONFIG.messagePrefix + '**'];

  if (order.orderNumber) {
    lines.push('\u53d7\u6ce8\u756a\u53f7: ' + order.orderNumber);
  }
  if (order.orderedAt) {
    lines.push('\u65e5\u6642: ' + order.orderedAt);
  }

  order.products.forEach(function (product, index) {
    lines.push('');
    lines.push((index + 1) + '. ' + product.name);
    product.options.forEach(function (option) {
      lines.push(option);
    });
    if (product.price) {
      lines.push(product.price);
    }
  });

  return lines.join('\n');
}

function formatDiscordDigestLine_(order, index) {
  const product = order.products[0];
  const productName = shortenText_(product.name, 44);
  const price = summarizePrice_(product.price);
  const orderedAt = shortenOrderedAt_(order.orderedAt);
  const orderNumber = order.orderNumber || '\u53d7\u6ce8\u756a\u53f7\u306a\u3057';
  return index + '. ' + orderedAt + ' / ' + orderNumber + ' / ' + productName + ' / ' + price;
}

function shortenOrderedAt_(orderedAt) {
  const match = String(orderedAt || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
  return match ? match[2] + '/' + match[3] + ' ' + match[4] : String(orderedAt || '');
}

function shortenText_(text, maxLength) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 1) + '\u2026';
}

function summarizePrice_(priceLine) {
  const line = String(priceLine || '').replace(/\s+/g, ' ').trim();
  const totalMatch = line.match(/=\s*([0-9,]+)\(\u5186\)/);
  if (totalMatch) {
    return totalMatch[1] + '\u5186';
  }

  const firstPriceMatch = line.match(/([0-9,]+)\(\u5186\)/);
  return firstPriceMatch ? firstPriceMatch[1] + '\u5186' : line;
}

function buildProcessedKey_(order, messageId) {
  return order.orderNumber || messageId;
}

function loadProcessedKeys_(properties) {
  const chunkCount = Number(properties.getProperty(CONFIG.processedChunkCountProperty) || 0);
  const keys = [];

  for (let index = 0; index < chunkCount; index += 1) {
    const rawValue = properties.getProperty(CONFIG.processedPropertyPrefix + index);
    if (!rawValue) {
      continue;
    }

    try {
      JSON.parse(rawValue).forEach(function (key) {
        keys.push(key);
      });
    } catch (error) {
      console.log('[WARN] failed to load processed keys: chunk=' + index + ' / ' + error);
    }
  }

  return keys.reduce(function (result, key) {
    result[key] = true;
    return result;
  }, {});
}

function saveProcessedKeys_(properties, processedKeys) {
  const keys = Object.keys(processedKeys).slice(-CONFIG.maxProcessedOrderKeys);
  const oldChunkCount = Number(properties.getProperty(CONFIG.processedChunkCountProperty) || 0);
  const newChunkCount = Math.ceil(keys.length / CONFIG.processedChunkSize);

  for (let index = 0; index < newChunkCount; index += 1) {
    const chunk = keys.slice(index * CONFIG.processedChunkSize, (index + 1) * CONFIG.processedChunkSize);
    properties.setProperty(CONFIG.processedPropertyPrefix + index, JSON.stringify(chunk));
  }

  for (let index = newChunkCount; index < oldChunkCount; index += 1) {
    properties.deleteProperty(CONFIG.processedPropertyPrefix + index);
  }

  properties.setProperty(CONFIG.processedChunkCountProperty, String(newChunkCount));
}

function getOrCreateLabel_(labelName) {
  return GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
}

function findFirst_(text, pattern) {
  const match = String(text || '').match(pattern);
  return match ? match[1].trim() : '';
}

function stripHtml_(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
