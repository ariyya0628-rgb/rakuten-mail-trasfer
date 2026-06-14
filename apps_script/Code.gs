const CONFIG = {
  gmailQuery: 'from:order@rakuten.co.jp subject:"\u3010\u697d\u5929\u5e02\u5834\u3011\u6ce8\u6587\u5185\u5bb9\u3054\u78ba\u8a8d\uff08\u81ea\u52d5\u914d\u4fe1\u30e1\u30fc\u30eb\uff09" newer_than:2d',
  lineEndpoint: 'https://api.line.me/v2/bot/message/broadcast',
  lineTokenProperty: 'LINE_CHANNEL_ACCESS_TOKEN',
  processedPropertyPrefix: 'PROCESSED_ORDER_KEYS_',
  processedChunkSize: 200,
  processedChunkCountProperty: 'PROCESSED_ORDER_KEYS_CHUNK_COUNT',
  targetLabelName: '\u697d\u5929/LINE\u901a\u77e5\u5bfe\u8c61',
  notifiedLabelName: '\u697d\u5929/LINE\u901a\u77e5\u6e08\u307f',
  failedLabelName: '\u697d\u5929/LINE\u901a\u77e5\u5931\u6557',
  messagePrefix: '\u697d\u5929 \u6ce8\u6587\u5546\u54c1',
  maxThreads: 20,
  maxProcessedOrderKeys: 3000,
  startAfter: '2026-06-12T13:47:00+09:00'
};

function notifyRakutenOrders() {
  const properties = PropertiesService.getScriptProperties();
  const lineToken = properties.getProperty(CONFIG.lineTokenProperty);
  if (!lineToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set.');
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
      const messageId = message.getId();
      if (!isAfterStart_(message)) {
        return;
      }

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

  pendingOrders.forEach(function (pending) {
    const message = pending.message;
    const order = pending.order;
    if (order.products.length === 0) {
      console.log('[SKIP] product block not found: ' + pending.messageId);
      return;
    }

    const lineMessage = formatLineMessage_(order);
    try {
      sendLineBroadcast_(lineToken, lineMessage);
      notifiedLabel.addToThread(message.getThread());
      processedKeys[pending.processedKey] = true;
      notifiedCount += 1;
      console.log('[OK] LINE sent: ' + (order.orderNumber || pending.messageId) + ' / ' + message.getDate());
    } catch (error) {
      failedLabel.addToThread(message.getThread());
      console.log('[ERROR] LINE failed: ' + (order.orderNumber || pending.messageId) + ' / ' + error);
    }
  });

  saveProcessedKeys_(properties, processedKeys);
  console.log('[INFO] notified: ' + notifiedCount);
}

function markExistingOrdersAsProcessed() {
  const properties = PropertiesService.getScriptProperties();
  const processedKeys = loadProcessedKeys_(properties);
  const threads = GmailApp.search(CONFIG.gmailQuery, 0, CONFIG.maxThreads);
  const targetLabel = getOrCreateLabel_(CONFIG.targetLabelName);
  const notifiedLabel = getOrCreateLabel_(CONFIG.notifiedLabelName);
  let markedCount = 0;

  threads.forEach(function (thread) {
    targetLabel.addToThread(thread);

    thread.getMessages().forEach(function (message) {
      const body = getMessageText_(message);
      const order = parseOrderEmail_(body);
      const processedKey = buildProcessedKey_(order, message.getId());
      if (!processedKeys[processedKey]) {
        processedKeys[processedKey] = true;
        notifiedLabel.addToThread(thread);
        markedCount += 1;
      }
    });
  });

  saveProcessedKeys_(properties, processedKeys);
  console.log('[OK] existing orders marked as processed: ' + markedCount);
}

function setLineToken() {
  const token = 'PASTE_CHANNEL_ACCESS_TOKEN_HERE';
  if (!token || token === 'PASTE_CHANNEL_ACCESS_TOKEN_HERE') {
    throw new Error('Paste the channel access token into setLineToken() first.');
  }

  PropertiesService.getScriptProperties().setProperty(CONFIG.lineTokenProperty, token);
  console.log('[OK] LINE token saved.');
}

function setupTrigger() {
  deleteTriggers();
  ScriptApp.newTrigger('notifyRakutenOrders')
    .timeBased()
    .everyMinutes(5)
    .create();
  console.log('[OK] trigger created: every 5 minutes.');
}

function deleteTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'notifyRakutenOrders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  console.log('[OK] notifyRakutenOrders triggers deleted.');
}

function testParser() {
  const sample = [
    '[\u5546\u54c1]',
    '\u30a2\u30a4\u30ea\u30b9\u30aa\u30fc\u30e4\u30de 4K\u653e\u9001\u5bfe\u5fdc\u30cf\u30fc\u30c9\u30c7\u30a3\u30b9\u30af 2TB HDCZ-UT2K-IR \u30d6\u30e9\u30c3\u30af(b09h35d7h4)',
    'SKU\u7ba1\u7406\u756a\u53f7:01',
    '\u30b5\u30a4\u30ba:2TB',
    '\u4fa1\u683c  21,560(\u5186) x 1(\u500b) = 21,560(\u5186) \u203b10%\u7a0e\u8fbc',
    '*********************************************************************',
    '\u9001\u6599\u8a08      0(\u5186)',
    '\u652f\u6255\u3044\u91d1\u984d     21,560(\u5186)',
    '[\u53d7\u6ce8\u756a\u53f7] 402853-20260612-0220534167',
    '[\u65e5\u6642]     2026-06-12 08:55:46'
  ].join('\n');

  const order = parseOrderEmail_(sample);
  const lineMessage = formatLineMessage_(order);
  console.log(lineMessage);
}

function getMessageText_(message) {
  const plainBody = message.getPlainBody();
  if (plainBody) {
    return plainBody;
  }

  return stripHtml_(message.getBody());
}

function isAfterStart_(message) {
  if (!CONFIG.startAfter) {
    return true;
  }

  return message.getDate().getTime() >= new Date(CONFIG.startAfter).getTime();
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

function formatLineMessage_(order) {
  const lines = [CONFIG.messagePrefix];

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

function sendLineBroadcast_(lineToken, text) {
  const response = UrlFetchApp.fetch(CONFIG.lineEndpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + lineToken
    },
    payload: JSON.stringify({
      messages: [
        {
          type: 'text',
          text: text
        }
      ]
    }),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  if (statusCode >= 400) {
    throw new Error('LINE send error: ' + statusCode + ' ' + response.getContentText());
  }
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
