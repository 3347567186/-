const DASHSCOPE_ENDPOINT =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const DASHSCOPE_TEXT_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
const DEFAULT_IMAGE_MODEL = 'wan2.6-t2i'
const DEFAULT_TEXT_MODEL = 'qwen3.1-plus'
const DEFAULT_VL_MODEL = 'qwen-vl-max'
const VALID_TAGS = [
  '蝴蝶纹', '花卉纹', '鸟纹', '几何纹',
  '靛蓝', '暖红', '明黄', '翠绿',
  '包边针', '填充针', '打籽针', '走针',
  '吉祥', '繁衍', '守护', '丰年',
  '文创包', '香囊', '服饰配件', '装饰画',
]
const TAG_DIMENSIONS = {
  shape: ['蝴蝶纹', '花卉纹', '鸟纹', '几何纹'],
  color: ['靛蓝', '暖红', '明黄', '翠绿'],
  craft: ['包边针', '填充针', '打籽针', '走针'],
  meaning: ['吉祥', '繁衍', '守护', '丰年'],
  use: ['文创包', '香囊', '服饰配件', '装饰画'],
}
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

// SerpAPI 配置（Google 图片搜索）
const SERPAPI_ENDPOINT = 'https://serpapi.com/search'
const SERPAPI_RESULTS_PER_QUERY = 6
const SERPAPI_MAX_QUERIES = 8

// 绣花搜索关键词池（自由组合搜索）
const SEARCH_KEYWORDS = {
  pattern: ['蝴蝶纹', '花卉纹', '鸟纹', '几何纹'],
  stitch: ['包边针', '填充针', '打籽针', '走针'],
  product: ['香囊', '服饰配件', '装饰画'],
}

export async function handleAiDesignRequest(body) {
  const payload = normalizePayload(body)
  const base = getTextApiKey()
    ? await callQwenPlanner(payload).catch(() => createDesignPlan(payload))
    : createDesignPlan(payload)

  if (!getImageApiKey()) {
    return {
      ...base,
      provider: '智能学习结果',
      summary: '已根据本地数据库生成方案文本；配置服务密钥后会自动完成归类、整合与图片生成。',
    }
  }

  try {
    const dashscope = await callDashScopeImage(payload, base.creation)
    return {
      ...base,
      provider: '智能学习结果',
      summary: `已自动完成语义整合、标签归类和方案图片生成，共生成 ${dashscope.images.length} 张图，可保存进数据库继续学习。`,
      images: dashscope.images,
      rawRequestId: dashscope.requestId,
    }
  } catch (error) {
    return {
      ...base,
      provider: '智能学习结果',
      summary: `图片生成暂不可用：${sanitizeError(error.message)}。页面已返回自动归类和整合方案文本。`,
    }
  }
}

export async function handleAiCrawlImagesRequest(body = {}) {
  const query = String(body.query || '').trim()
  const database = Array.isArray(body.database) ? body.database : []
  const seenUrls = Array.isArray(body.seenUrls) ? body.seenUrls : []
  const seenTitles = Array.isArray(body.seenTitles) ? body.seenTitles : []

  // 从数据库和 seenUrls 中提取所有原始图片 URL 和标题（统一标准化后去重）
  const existingUrls = new Set(
    [...database, ...seenUrls.map((u) => ({ image: u }))]
      .map((asset) => normalizeUrl(extractOriginalUrl(asset.image || '')))
      .filter(Boolean),
  )
  const existingTitles = new Set(
    [...database.map((a) => a.title), ...seenTitles]
      .filter(Boolean)
      .map((t) => t.trim().toLowerCase()),
  )

  const crawlPlan = getTextApiKey()
    ? await callQwenCrawlQueries(query, database).catch(() => ({ queries: defaultCrawlQueries(query), tagSuggestions: [], analysis: '' }))
    : { queries: defaultCrawlQueries(query), tagSuggestions: [], analysis: '' }
  const searchQueries = crawlPlan.queries
  // 合并关键词池组合（确保绣花标签全覆盖）
  const poolQueries = generateKeywordQueries()
  const mergedQueries = [...new Set([...searchQueries, ...poolQueries])].slice(0, 18)
  const crawledImages = await searchPublicEmbroideryImages(mergedQueries)
  const uniqueImages = dedupeBy(crawledImages, (item) => item.image)
    .filter((item) => {
      const imgUrl = normalizeUrl(extractOriginalUrl(item.image || ''))
      const title = (item.title || '').trim().toLowerCase()
      return !existingUrls.has(imgUrl) && !existingTitles.has(title)
    })
    .slice(0, 24)
  const rawAssets = uniqueImages.map((item) => ({
    id: `crawl-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: item.title,
    category: '文创产品',
    image: proxiedImageUrl(item.image),
    source: item.source || '公开图片检索',
    capturedAt: new Date().toISOString().slice(0, 10),
    learned: 1,
    confidence: 78,
    tags: ['AI自学习', '待确认入库'],
    note: item.description || '联网检索得到的候选图片，等待确认后进入数据库。',
    referenceUrl: item.pageUrl,
    originalImage: item.image,
  }))

  // 搜索引擎至少把 15 张候选交给 VL 前置池；Plus 只负责关键词和轻量文本去噪。
  const filteredAssets = rawAssets.length > 6
    ? await filterCandidatesViaQwen(rawAssets, query).catch(() => rawAssets)
    : rawAssets

  // qwen-vl-max 负责核对图片特征、关键词匹配和重复过滤。
  const topCandidates = filteredAssets.slice(0, Math.max(15, Math.min(filteredAssets.length, 24))).map(({ _relevance, ...rest }) => rest)
  const vlCheckedAssets = topCandidates.length
    ? await visualFilterViaVL(topCandidates, { query, queries: mergedQueries, tagSuggestions: crawlPlan.tagSuggestions }).catch(() => topCandidates)
    : topCandidates

  // VL 过滤后如果太少，回退到文字筛选结果
  const finalAssets = (vlCheckedAssets.length >= 3 ? vlCheckedAssets : topCandidates.slice(0, 8))
    .map(({ _vlPass, ...rest }) => rest)
  const suggestedTagNames = flattenSuggestedTags(crawlPlan.tagSuggestions)
  const assets = finalAssets.length
    ? (await enrichAssetBatch(finalAssets)).map((asset) => ({
        ...asset,
        tags: [...new Set([...(asset.tags || []), ...suggestedTagNames])].slice(0, 12),
        suggestedTags: crawlPlan.tagSuggestions,
      }))
    : []

  // 联网搜索没结果时，用本地样本作为兜底候选（过滤掉已存在的图片）
  if (!assets.length) {
    const localSamples = [
      { title: '苗绣蝴蝶纹文创作品样本', image: '/media/hero-pattern-detail.jpg', source: '本地样本' },
      { title: '鸟纹花卉装饰画样本', image: '/media/embroidered-panel.jpg', source: '本地样本' },
      { title: '花卉香囊小幅纹样样本', image: '/media/botanical-stitch.jpg', source: '本地样本' },
      { title: '几何边饰纹样采集样本', image: '/media/ethnic-textile.jpg', source: '本地样本' },
    ]
    for (const sample of localSamples) {
      // 检查本地样本是否已在数据库中，避免同一张图片反复出现
      const sampleUrl = normalizeUrl(extractOriginalUrl(sample.image || ''))
      if (existingUrls.has(sampleUrl)) continue
      const analyzed = enrichAssetByRules(sample)
      assets.push({
        ...analyzed,
        id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        confidence: 74,
        note: '联网检索暂未返回可用图片，展示本地样本作为候选。确认入库后可在数据库中查看。',
      })
    }
  }

  // 通过 qwen3.7-plus(enable_search) 获取 AI 联网分析结果
  let aiAnalysis = crawlPlan.analysis || ''
  if (getTextApiKey()) {
    try {
      const analysisBody = {
        model: process.env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
        enable_search: true,
        messages: [
          {
            role: 'system',
            content: '你是民族刺绣与文创领域的 AI 搜索专家。使用联网搜索获取最新信息，然后给出分析。只输出纯文本，不要 JSON。',
          },
          {
            role: 'user',
            content: `用户正在搜索刺绣相关图片，搜索意图：${query || '苗绣/民族刺绣相关素材'}。
请用联网搜索完成以下任务：
1. 当前网上有哪些苗绣、民族刺绣的热门纹样和文创产品类型
2. 针对用户的搜索意图，推荐哪些具体的搜索方向
3. 简要说明这些纹样/产品的文化背景和工艺特点

控制在 150 字以内，简洁实用。`,
          },
        ],
        temperature: 0.5,
      }
      const resp = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getTextApiKey()}` },
        body: JSON.stringify(analysisBody),
      }, 10000)
      const data = await resp.json()
      if (resp.ok) {
        aiAnalysis = data.choices?.[0]?.message?.content || ''
      }
    } catch {
      // AI 分析不是必须的，失败不影响图片搜索结果
    }
  }

  return {
    provider: '智能学习结果',
    summary: `Plus 已生成 ${searchQueries.length} 组五维关键词，搜索引擎抓取候选图后由 qwen-vl-max 过滤，保留 ${assets.length} 张待确认图片。`,
    queries: mergedQueries,
    tagSuggestions: crawlPlan.tagSuggestions,
    assets,
    aiAnalysis, // AI 联网搜索结果，前端可展示
  }
}

export async function handleAiOrganizeAssetsRequest(body = {}) {
  const assets = Array.isArray(body.assets) ? body.assets.slice(0, 80) : []

  // Step 1: VL visual analysis for each image (critical for uploaded images with no metadata)
  let vlTagged = assets
  try {
    const vlResults = await tagViaVLForAllAssets(assets)
    vlTagged = (vlResults || []).length === assets.length ? vlResults : assets
  } catch { /* VL unavailable */ }

  // Step 2: Text model refinement with VL-enriched context
  const organized = await enrichAssetBatch(vlTagged)

  return {
    provider: '智能学习结果',
    summary: `已整理 ${organized.length} 张作品图片，视觉识别+语义分析补全五维标签和分类。`,
    assets: organized,
  }
}

export async function handleAiTagAssetsRequest(body = {}) {
  const assets = Array.isArray(body.assets) ? body.assets : []
  const results = await tagViaVLForAllAssets(assets)
  return {
    provider: 'AI 视觉标签识别',
    summary: `已完成 ${results.length} 张图片的五维标签识别，仅保留与特征匹配的标签。`,
    assets: results,
  }
}

async function tagAssetViaVL(asset) {
  const publicDir = process.env.PUBLIC_DIR || path.resolve(process.cwd(), 'public')
  const imageUrl = (asset.image || '').replace(/[?#].*$/, '')
  let imagePath = ""
  if (/^\/media\//i.test(imageUrl)) {
    imagePath = path.join(publicDir, imageUrl)
  } else if (/^\/uploads?\//i.test(imageUrl)) {
    imagePath = path.join(process.cwd(), 'data', 'uploads', path.basename(imageUrl))
  }
  let base64DataUrl = ''

  if (imagePath && existsSync(imagePath)) {
    let buffer = await readFile(imagePath)
    const ext = path.extname(imagePath).toLowerCase()
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    // Resize large images to avoid DashScope VL API file size limit
    if (buffer.length > 3 * 1024 * 1024) {
      try {
        buffer = await sharp(buffer)
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer()
      } catch {
        // If sharp fails, use original buffer
      }
    }
    base64DataUrl = `data:${mime};base64,${buffer.toString('base64')}`
  }

  const dimPrompt = `形（纹样形态）：${TAG_DIMENSIONS.shape.join('、')}
色（色彩特征）：${TAG_DIMENSIONS.color.join('、')}
工（工艺针法）：${TAG_DIMENSIONS.craft.join('、')}
意（文化寓意）：${TAG_DIMENSIONS.meaning.join('、')}
用（应用场景）：${TAG_DIMENSIONS.use.join('、')}`

  const content = [{ type: 'text', text: `你是一个民族刺绣文化基因识别专家。仔细观察这张照片中的刺绣纹样，从以下五维标签中选出最匹配的标签。注意：优先选择视觉上最接近的标签，每维至少选一个。如果某个维度的特征不明显，仍根据画面整体氛围和常见刺绣特征选择最可能的标签。

${dimPrompt}

只输出 JSON：{"shape":"","color":"","craft":"","meaning":"","use":"","category":"设备|纹样库|文创产品"}` }]
  if (base64DataUrl) content.unshift({ type: 'image_url', image_url: { url: base64DataUrl } })

  const messages = [
    { role: 'system', content: '你是专业民族刺绣文化基因识别AI。只根据图片视觉特征从给定的五维标签列表中选标签，不猜测、不编造。只输出JSON。' },
    { role: 'user', content },
  ]

  try {
    const response = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getVlApiKey()}` },
      body: JSON.stringify({ model: process.env.DASHSCOPE_VL_MODEL || DEFAULT_VL_MODEL, messages, temperature: 0.15, max_tokens: 512, response_format: { type: 'json_object' } }),
    }, 20000)
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || data.error?.message || 'VL request failed')
    return JSON.parse(data.choices?.[0]?.message?.content || '{}')
  } catch {
    // Fall back to text-only inference from metadata
    messages[1].content = [{ type: 'text', text: `根据照片的标题、来源和已有标签信息，从以下五维标签中选出最匹配的。根据标题和来源信息推测最可能的标签，每维至少选一个。

${dimPrompt}

标题：${asset.title || ''}
来源：${asset.source || ''}
现有标签：${(asset.tags || []).join('、')}

只输出 JSON：{"shape":"","color":"","craft":"","meaning":"","use":"","category":""}` }]
    const fallbackResponse = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getVlApiKey()}` },
      body: JSON.stringify({ model: process.env.DASHSCOPE_VL_MODEL || DEFAULT_VL_MODEL, messages, temperature: 0.15, max_tokens: 512, response_format: { type: 'json_object' } }),
    }, 20000)
    const fallbackData = await fallbackResponse.json()
    if (!fallbackResponse.ok) throw new Error(fallbackData.message || fallbackData.error?.message || 'VL fallback failed')
    return JSON.parse(fallbackData.choices?.[0]?.message?.content || '{}')
  }
}

async function tagViaVLForAllAssets(assets) {
  if (!getVlApiKey()) return assets.map(applyFallbackTagging)

  const results = []
  const batchSize = 5
  for (let i = 0; i < assets.length; i += batchSize) {
    const batch = assets.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map((a) => a.id ? applyVlTagging(a) : applyFallbackTagging(a)))
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value)
      } else {
        results.push(applyFallbackTagging(batch[j]))
      }
    }
  }
  return results
}

async function applyVlTagging(asset) {
  const vlResult = await tagAssetViaVL(asset)
  if (!vlResult || typeof vlResult !== 'object') return applyFallbackTagging(asset)

  const category = ['设备', '纹样库', '文创产品'].includes(vlResult.category)
    ? vlResult.category
    : asset.category || '文创产品'

  // 设备和纹样库保留原有标签，不做文化维度过滤
  if (category === '设备' || category === '纹样库') {
    return {
      ...asset,
      category,
      tags: asset.tags || [],
      confidence: Math.min(Math.max(asset.confidence || 82, 88), 97),
      note: `AI 视觉识别归为「${category}」，保留原有标签。`,
    }
  }

  // 文创产品：只保留与五维匹配的标签
  const dimensionTags = [
    ...parseVlValue(vlResult.shape, TAG_DIMENSIONS.shape),
    ...parseVlValue(vlResult.color, TAG_DIMENSIONS.color),
    ...parseVlValue(vlResult.craft, TAG_DIMENSIONS.craft),
    ...parseVlValue(vlResult.meaning, TAG_DIMENSIONS.meaning),
    ...parseVlValue(vlResult.use, TAG_DIMENSIONS.use),
  ]

  return {
    ...asset,
    category,
    tags: dimensionTags.length ? dimensionTags : filterToValidTags(asset.tags || []),
    confidence: Math.min(Math.max(asset.confidence || 82, 88), 97),
    note: `AI 视觉识别：形=${vlResult.shape || '—'}、色=${vlResult.color || '—'}、工=${vlResult.craft || '—'}、意=${vlResult.meaning || '—'}、用=${vlResult.use || '—'}`,
  }
}

function parseVlValue(value, validList) {
  if (!value) return []
  const items = Array.isArray(value) ? value : value.split(/[,，、\s]+/)
  return items.filter((t) => validList.includes(t)).slice(0, 2)
}

function applyFallbackTagging(asset) {
  const text = `${asset.title || ''} ${asset.source || ''} ${(asset.tags || []).join(' ')} ${asset.note || ''}`
  const tags = new Set()
  let category = asset.category || '文创产品'
  if (/设备|机器|绣花机|机头|展会|machine|device/i.test(text)) category = '设备'
  if (/纹样|图谱|针法|template|library|pattern|gene/i.test(text)) category = '纹样库'
  if (/产品|包|香囊|服饰|装饰画|作品|文创|product|bag|sachet|accessory|panel/i.test(text)) category = '文创产品'

  // 设备和纹样库保留原有标签
  if (category === '设备' || category === '纹样库') {
    return {
      ...asset,
      category,
      tags: asset.tags || [],
      confidence: Math.min(Math.max(asset.confidence || 76, 78), 94),
      note: asset.note || `AI 文本识别归为「${category}」，保留原有标签。`,
    }
  }

  for (const tag of VALID_TAGS) {
    const patternMap = {
      '蝴蝶纹': /蝴蝶|butterfly/i,
      '花卉纹': /花|flower|botanical/i,
      '鸟纹': /鸟|bird/i,
      '几何纹': /几何|边饰|geometric|border/i,
      '靛蓝': /蓝|靛|indigo|blue/i,
      '暖红': /红|red/i,
      '明黄': /黄|yellow/i,
      '翠绿': /绿|green|翠/i,
      '包边针': /包边|轮廓|border/i,
      '填充针': /填充|fill/i,
      '打籽针': /打籽|seed/i,
      '吉祥': /吉祥|好运|luck/i,
      '繁衍': /繁衍|multiplication|繁衍/i,
      '守护': /守护|protect|guard/i,
      '丰年': /丰年|harvest|bumper/i,
      '文创包': /包|bag|文创包/i,
      '香囊': /香囊|sachet/i,
      '服饰配件': /服饰|配件|衣|accessory/i,
      '装饰画': /装饰画|挂画|panel/i,
    }
    if (patternMap[tag]?.test(text)) tags.add(tag)
  }

  return {
    ...asset,
    category,
    tags: [...tags].length ? [...tags] : filterToValidTags(asset.tags || []),
    confidence: Math.min(Math.max(asset.confidence || 76, 78), 94),
    note: asset.note || `AI 文本识别归类为${category}`,
  }
}

function filterToValidTags(tags) {
  return (tags || []).map((t) => {
    const exact = t.trim()
    if (VALID_TAGS.includes(exact)) return exact
    // Fuzzy map: common AI tag variations -> canonical form
    const fuzzy = {
      '蝴蝶': '蝴蝶纹', '花卉': '花卉纹', '鸟': '鸟纹', '几何': '几何纹', '鱼': '鱼纹', '云': '云纹', '水波': '水波纹',
      '靛': '靛蓝', '蓝': '靛蓝', '暖': '暖红', '红': '暖红', '黄': '明黄', '绿': '翠绿', '白': '银白', '黑': '黛黑',
      '包边': '包边针', '填充': '填充针', '打籽': '打籽针', '走': '走针', '盘金': '盘金绣', '锁边': '锁边针', '平': '平针', '堆叠': '堆叠绣',
      '吉祥': '吉祥', '繁盛': '繁盛', '守护': '守护', '丰年': '丰年',
      '文创包': '文创包', '香囊': '香囊', '服饰配件': '服饰配件', '装饰画': '装饰画',
    }
    for (const [key, val] of Object.entries(fuzzy)) {
      if (exact.includes(key) && VALID_TAGS.includes(val)) return val
    }
    return null
  }).filter(Boolean).filter((t, i, arr) => arr.indexOf(t) === i)
}
/* Tag-to-dimension mapping: given a flat tag, return which gene dimension it belongs to */
function tagToDimension(tag) {
  for (const [dim, options] of Object.entries(TAG_DIMENSIONS)) {
    if (options.includes(tag)) return dim
  }
  return null
}

/* Given an asset with a "tags" array, populate shape/color/craft/meaning/use
   dimension-specific arrays and filter dimension tags from the flat list.
   This is REQUIRED for the frontend gene-map Matching logic. */
function populateGeneDimensions(asset) {
  const tagList = filterToValidTags(asset.tags || [])
  const dimFields = { shape: [], color: [], craft: [], meaning: [], use: [] }
  const nonDimTags = []

  for (const tag of tagList) {
    const dim = tagToDimension(tag)
    if (dim && dimFields[dim]) {
      if (!dimFields[dim].includes(tag)) dimFields[dim].push(tag)
    } else {
      nonDimTags.push(tag)
    }
  }

  /* Merge with existing dimension fields from the asset (if any) */
  for (const dim of Object.keys(dimFields)) {
    if (Array.isArray(asset[dim]) && asset[dim].length > 0) {
      dimFields[dim] = [...new Set([...asset[dim], ...dimFields[dim]])]
    }
  }

  /* Preserve useful non-dimension tags */
  const usefulTags = ['智能绣花机','文化基因','非遗传承认','机器学习','数据库样本',
    '高精度传感','图像识别','AI设计','DST文件','展厅实拍','CIC行架']
  for (const t of usefulTags) {
    if (tagList.includes(t) && !nonDimTags.includes(t)) {
      nonDimTags.push(t)
    }
  }

  return {
    ...asset,
    ...dimFields,
    tags: nonDimTags,
    confidence: asset.confidence || 80,
    learned: asset.learned || 1,
  }
}


function normalizeTagSuggestions(items) {
  const validDimensions = new Set(['shape', 'color', 'craft', 'meaning', 'use'])
  if (!Array.isArray(items)) return []
  return items
    .map((item) => ({
      dimension: validDimensions.has(item?.dimension) ? item.dimension : '',
      label: String(item?.label || '').trim().slice(0, 16),
      reason: String(item?.reason || '').trim().slice(0, 80),
    }))
    .filter((item) => item.dimension && item.label)
    .slice(0, 16)
}

function flattenSuggestedTags(items) {
  return normalizeTagSuggestions(items).map((item) => item.label)
}

function normalizePayload(body = {}) {
  return {
    query: String(body.query || '').trim(),
    mode: body.mode || 'search-create',
    selection: body.selection || {},
    prompt: body.prompt || '',
    database: Array.isArray(body.database) ? body.database.slice(0, 24) : [],
  }
}

async function callQwenPlanner(payload) {
  const response = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getTextApiKey()}`,
    },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
      enable_search: true,
      messages: [
        {
          role: 'system',
          content:
            '你是民族刺绣数据库的智能整理助手。你可以联网搜索获取最新的刺绣纹样、文创产品和工艺资料。你需要根据文化基因、用户需求和本地图片数据库，完成自动归类、相关图片搜索词生成、标签整合、创作方案生成。只输出 JSON，不要输出 Markdown。',
        },
        {
          role: 'user',
          content: `用户需求：${payload.query}
当前文化基因：${JSON.stringify(payload.selection)}
结构化提示词：${payload.prompt}
本地图片数据库摘要：${JSON.stringify(payload.database)}

请先联网搜索最新的相关纹样、产品和工艺资料，然后输出 JSON：
{
  "summary": "一句话说明自动学习和整合结果",
  "searchQueries": ["用于搜索相关图片的关键词"],
  "references": [{"title":"搜索线索标题","url":"搜索网址","reason":"参考价值"}],
  "creation": {
    "title": "方案标题",
    "category": "设备|纹样库|文创产品",
    "concept": "新方案说明，包含形、色、工、意、用和机绣适配",
    "tags": ["自动标签"],
    "confidence": 80
  }
}`,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  }, 25000)

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || data.error?.message || 'Text planning request failed')
  }

  const text = data.choices?.[0]?.message?.content || ''
  const parsed = JSON.parse(text)
  const fallback = createDesignPlan(payload)
  const searchQueries = Array.isArray(parsed.searchQueries) ? parsed.searchQueries : []

  return {
    ...fallback,
    provider: '智能学习结果',
    summary: parsed.summary || fallback.summary,
    references: normalizeReferences(parsed.references, searchQueries, payload),
    creation: {
      ...fallback.creation,
      ...(parsed.creation || {}),
      tags: Array.isArray(parsed.creation?.tags) ? parsed.creation.tags : fallback.creation.tags,
      confidence: Number(parsed.creation?.confidence) || fallback.creation.confidence,
    },
  }
}

async function callQwenCrawlQueries(query, database) {
  const response = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getTextApiKey()}`,
    },
    body: JSON.stringify({
      model: process.env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
      enable_search: true,
      messages: [
        {
          role: 'system',
          content:
            '你是民族刺绣图片数据库的 Plus 检索规划核心。90%的探索工作由你完成，搜索引擎只执行你的关键词。围绕形、色、工、意、用五类生成关键词和可新增标签，不局限于既有苗绣风格，可以联网探索更多民族刺绣、机绣、文创转化方向。只输出 JSON，不输出 Markdown。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: '生成用于搜索真实绣花/刺绣照片的关键词，并提出可加入五维板块的新标签',
            query,
            existingAssets: database.map(({ title, category, tags }) => ({ title, category, tags })),
            currentDimensions: {
              shape: TAG_DIMENSIONS.shape,
              color: TAG_DIMENSIONS.color,
              craft: TAG_DIMENSIONS.craft,
              meaning: TAG_DIMENSIONS.meaning,
              use: TAG_DIMENSIONS.use,
            },
            output: {
              queries: ['侗绣 螺旋纹 靛蓝 服饰 刺绣 实拍', '苗绣 蝴蝶纹 银线 包边针 香囊 实物照片'],
              tagSuggestions: [
                { dimension: 'shape', label: '螺旋纹', reason: '常见于民族刺绣连续纹样' },
                { dimension: 'craft', label: '盘金绣', reason: '可作为机绣工艺适配参考' },
              ],
              analysis: '简短说明探索方向',
            },
          }),
        },
      ],
      temperature: 0.75,
      response_format: { type: 'json_object' },
    }),
  }, 15000)
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || data.error?.message || 'Crawl query request failed')
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
  return {
    queries: Array.isArray(parsed.queries) && parsed.queries.length ? parsed.queries.slice(0, 12) : defaultCrawlQueries(query),
    tagSuggestions: normalizeTagSuggestions(parsed.tagSuggestions),
    analysis: String(parsed.analysis || '').slice(0, 240),
  }
}

/** 使用 qwen3.7-plus 对搜索候选图片做分类筛选，只保留刺绣特写实拍 */
async function filterCandidatesViaQwen(assets, _query) {
  if (!getTextApiKey() || !assets.length) return assets
  try {
    const response = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getTextApiKey()}`,
      },
      body: JSON.stringify({
        model: process.env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一个严格的刺绣图片分类器。根据标题和描述，将每条候选图片分为以下类型之一。**只保留类型 A**，其他全部排除。\n\nA = 刺绣特写实拍：能清晰看到刺绣针法、绣线纹理、绣花纹样的实物近景/特写照片\nB = 文章配图/百科/博物馆：图片嵌套在文章或百科中，展示的是完整物品而非刺绣细节\nC = 设计素材/PNG/矢量图：免费素材、设计资源、PNG图案、壁纸、海报\nD = 电商商品缩略图：淘宝/天猫/京东等商品列表小图\nE = 不相关：与刺绣无关的内容\n\n返回 JSON: { "candidates": [{ "id": "原样传回的id", "type": "A|B|C|D|E", "reason": "简短原因" }] }',
          },
          {
            role: 'user',
            content: JSON.stringify({
              candidates: assets.map((a) => ({
                id: a.id,
                title: a.title,
                description: (a.note || '').slice(0, 200),
                pageUrl: a.referenceUrl || '',
              })),
            }),
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    }, 15000)
    const data = await response.json()
    if (!response.ok) return assets
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    const resultList = Array.isArray(parsed.candidates) ? parsed.candidates : []
    if (!resultList.length) return assets

    const resultMap = new Map(resultList.map((r) => [r.id, r]))
    return assets
      .filter((a) => {
        const r = resultMap.get(a.id)
        return r && r.type === 'A'
      })
      .map((a) => ({ ...a, _relevance: 100 }))
  } catch {
    return assets
  }
}

/** 使用 qwen-vl-max 视觉模型验证图片是否清晰展示绣花细节 */
async function visualFilterViaVL(assets, plan = {}) {
  if (!getVlApiKey() || !assets.length) return assets
  const toCheck = assets.slice(0, 15)
  try {
    const results = await Promise.all(toCheck.map(async (asset) => {
      const imgUrl = asset.originalImage || ''
      if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) return { ...asset, _vlPass: false }
      try {
        const response = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getVlApiKey()}` },
          body: JSON.stringify({
            model: process.env.DASHSCOPE_VL_MODEL || DEFAULT_VL_MODEL,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'image_url', image_url: { url: imgUrl } },
                  { type: 'text', text: `请仔细观察这张图片，核对它是否匹配本轮关键词和五维标签探索方向。

用户意图：${plan.query || '民族刺绣图片自学习'}
搜索关键词：${(plan.queries || []).slice(0, 8).join('、')}
建议新标签：${flattenSuggestedTags(plan.tagSuggestions || []).join('、')}

只保留：真实照片、刺绣/绣花为主体、能看出纹样/色彩/针法/应用场景，且与关键词方向相关。
排除：设计素材、矢量图、文章截图、博物馆远景、电商水印、重复或不相关图片。

只输出 JSON：{"pass":true,"reason":"简短原因","tags":["从图片能确认的五维标签"]}` },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 256,
            response_format: { type: 'json_object' },
          }),
        }, 12000)
        const data = await response.json()
        if (!response.ok) return { ...asset, _vlPass: false }
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
        return {
          ...asset,
          _vlPass: Boolean(parsed.pass),
          tags: [...new Set([...(asset.tags || []), ...(Array.isArray(parsed.tags) ? parsed.tags : [])])],
          note: parsed.reason || asset.note,
        }
      } catch {
        return { ...asset, _vlPass: false }
      }
    }))

    const passed = dedupeBy(results.filter((a) => a._vlPass), (a) => normalizeUrl(a.originalImage || a.image || ''))
    return passed.length >= 3 ? passed : results
  } catch {
    return assets
  }
}

async function enrichAssetBatch(assets) {
  const fallback = assets.map(enrichAssetByRules)
  if (!getTextApiKey() || !assets.length) return fallback

  try {
    const response = await fetchWithTimeout(DASHSCOPE_TEXT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getTextApiKey()}`,
      },
      body: JSON.stringify({
        model: process.env.DASHSCOPE_TEXT_MODEL || DEFAULT_TEXT_MODEL,
        enable_search: true,
        messages: [
          {
            role: 'system',
            content:
              '你是民族刺绣五维文化基因分类专家。必须严格从提供的形/色/工/意/用标签库中为每张图片选取匹配标签。可以联网搜索辅助判断。每张图片必须给出形、色、工、意、用五个维度中至少3个维度的标签。标签只能从 tagDimensions 列表中选择，不得编造。只能输出 JSON，不输出 Markdown。',
          },
          {
            role: 'user',
            content: JSON.stringify({
              categories: ['设备', '纹样库', '文创产品'],
              tagDimensions: {
                shape: ['蝴蝶纹', '花卉纹', '鸟纹', '几何纹'],
                color: ['靛蓝', '暖红', '明黄', '翠绿'],
                craft: ['包边针', '填充针', '打籽针', '走针'],
                meaning: ['吉祥', '繁衍', '守护', '丰年'],
                use: ['文创包', '香囊', '服饰配件', '装饰画'],
              },
              assets: fallback.map(({ id, title, category, source, tags, note, referenceUrl }) => ({
                id,
                title,
                category,
                source,
                tags,
                note,
                referenceUrl,
              })),
              output: {
                assets: [
                  {
                    id: '保持原 id',
                    title: '优化后的名称',
                    category: '设备|纹样库|文创产品',
                    tags: ['4-8个标签'],
                    note: '80字以内介绍说明',
                    confidence: 80,
                  },
                ],
              },
            }),
          },
        ],
        temperature: 0.35,
        response_format: { type: 'json_object' },
      }),
    }, 16000)
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || data.error?.message || 'Organize request failed')
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    const aiAssets = Array.isArray(parsed.assets) ? parsed.assets : []
    const byId = new Map(aiAssets.map((asset) => [asset.id, asset]))
    return fallback.map((asset) => {
      const ai = byId.get(asset.id)
      if (!ai) return populateGeneDimensions(asset)
      const enriched = {
        ...asset,
        title: ai.title || asset.title,
        category: ['设备', '纹样库', '文创产品'].includes(ai.category) ? ai.category : asset.category,
        tags: Array.isArray(ai.tags) && ai.tags.length ? filterToValidTags(ai.tags.slice(0, 10)) : filterToValidTags(asset.tags),
        note: ai.note || asset.note,
        confidence: Number(ai.confidence) || asset.confidence,
      }
      return populateGeneDimensions(enriched)
    })
  } catch {
    return fallback.map((a) => populateGeneDimensions(a))
  }
}

function enrichAssetByRules(asset) {
  const text = `${asset.title || ''} ${asset.source || ''} ${(asset.tags || []).join(' ')} ${asset.note || ''}`
  const tags = new Set(asset.tags || [])
  let category = asset.category || '文创产品'
  if (/设备|机器|绣花机|机头|展会|machine|device/i.test(text)) category = '设备'
  if (/纹样|图谱|针法|模板|library|pattern|gene/i.test(text)) category = '纹样库'
  if (/产品|包|香囊|服饰|装饰画|作品|文创|product|bag|sachet|accessory|panel/i.test(text)) category = '文创产品'

  ;[
    ['蝴蝶纹', /蝴蝶|butterfly/i],
    ['花卉纹', /花|flower|botanical/i],
    ['鸟纹', /鸟|bird/i],
    ['几何纹', /几何|边饰|geometric|border/i],
    ['靛蓝', /蓝|靛|indigo|blue/i],
    ['暖红', /红|red/i],
    ['明黄', /黄|yellow/i],
    ['翠绿', /绿|green/i],
    ['包边针', /包边|轮廓|border/i],
    ['填充针', /填充|fill/i],
    ['打籽针', /打籽|seed/i],
    ['走针', /走针|running/i],
    ['文创包', /包|bag/i],
    ['香囊', /香囊|sachet/i],
    ['服饰配件', /服饰|配件|衣|accessory/i],
    ['装饰画', /装饰画|挂画|panel/i],
  ].forEach(([tag, pattern]) => {
    if (pattern.test(text)) tags.add(tag)
  })
  if (!tags.size) tags.add(category)

  const result = {
    ...asset,
    category,
    tags: filterToValidTags([...tags]),
    confidence: Math.min(Math.max(asset.confidence || 76, 78), 96),
    note:
      asset.note && !/待确认|等待确认|新加入/.test(asset.note)
        ? asset.note
        : `已按标题、来源与图像线索归类为${category}，可用于后续检索、标签学习和文创图案生成。`,
  }
  return populateGeneDimensions(result)
}

/** 从关键词池生成 "绣花" + 各标签组合的搜索词 */
function generateKeywordQueries() {
  const prefix = '绣花'
  const { pattern, stitch, product } = SEARCH_KEYWORDS
  const queries = []

  // 单标签 + 绣花
  for (const p of pattern) queries.push(`${prefix}${p}`)
  for (const s of stitch) queries.push(`${prefix}${s}`)
  for (const pr of product) queries.push(`${prefix}${pr}`)

  // 纹样 + 产品
  for (const p of pattern) {
    for (const pr of product) {
      queries.push(`${prefix}${p}${pr}`)
    }
  }

  // 纹样 + 针法
  for (const p of pattern) {
    for (const s of stitch) {
      queries.push(`${prefix}${p}${s}`)
    }
  }

  // 随机打乱取前 16 条，确保多样性
  return queries.sort(() => Math.random() - 0.5).slice(0, 16)
}

function defaultCrawlQueries(query) {
  // 优先使用关键词池生成的组合词
  const poolQueries = generateKeywordQueries()
  if (poolQueries.length >= 4) return poolQueries

  const base = query || '苗绣 刺绣 文创 产品 图片'
  return [
    `苗绣 实物 实拍 刺绣 作品 ${base}`,
    `苗族刺绣 传统纹样 蝴蝶 花卉 鸟纹 实物`,
    `苗绣 文创 包 香囊 服饰 配件 实物拍摄`,
    `苗绣 手工刺绣 针法 细节 实拍 特写`,
    `民族刺绣 非遗 传统工艺 织绣 实物`,
  ]
    .filter(Boolean)
    .slice(0, 5)
}

async function searchPublicEmbroideryImages(queries) {
  // 优先使用 SerpAPI（Google 图片搜索）
  const serpResults = await searchImagesViaSerpApi(queries)
  if (serpResults.length >= 2) return serpResults

  // SerpAPI 不可用时回退到 Bing HTML 爬取
  const bingHtmlResults = await searchImagesViaBingHtml(queries)
  if (bingHtmlResults.length) return bingHtmlResults

  // 两者都失败时返回本地占位图
  return [
    {
      title: '苗绣蝴蝶纹文创作品候选',
      image: '/media/hero-pattern-detail.jpg',
      pageUrl: buildSearchUrl('苗绣 蝴蝶纹 文创 作品'),
      source: '公开图片检索',
      description: '联网检索暂未返回可用图片，使用本地样图作为候选占位。',
    },
    {
      title: '花卉纹香囊作品候选',
      image: '/media/botanical-stitch.jpg',
      pageUrl: buildSearchUrl('刺绣 花卉纹 香囊 作品'),
      source: '公开图片检索',
      description: '联网检索暂未返回可用图片，使用本地样图作为候选占位。',
    },
  ]
}

/** SerpAPI Google 图片搜索 */
async function searchImagesViaSerpApi(queries) {
  // 直接从 .env 文件读取，确保 Vite loadEnv 不干扰
  let apiKey = process.env.SERPAPI_API_KEY || ''
  if (!apiKey || apiKey.startsWith('在此填写')) {
    try {
      const envPath = path.resolve(process.cwd(), '.env')
      if (existsSync(envPath)) {
        const envContent = await readFile(envPath, 'utf8')
        const match = envContent.match(/^SERPAPI_API_KEY=(.+)$/m)
        if (match) apiKey = match[1].trim()
      }
    } catch {}
  }
  if (!apiKey || apiKey.startsWith('在此填写')) {
    return []
  }

  const targetQueries = queries.slice(0, SERPAPI_MAX_QUERIES).filter((q) => q && q.length >= 2)
  const results = (await Promise.all(targetQueries.map(async (query) => {
    const cleanQuery = query.replace(/^绣花/, '').trim()
    const searchTerm = `绣花图案${cleanQuery}`
    const url = `${SERPAPI_ENDPOINT}?engine=google_images&q=${encodeURIComponent(searchTerm)}&api_key=${encodeURIComponent(apiKey)}&ijn=0&num=${SERPAPI_RESULTS_PER_QUERY}&tbs=ift:photo`
    try {
      const response = await fetchWithTimeout(url, {}, 8000)
      const data = await response.json()
      if (!response.ok || data.error) return []
      const items = Array.isArray(data.images_results) ? data.images_results : []
      return items
        .filter((item) => {
          if (!item.original || !/^https?:\/\//i.test(item.original)) return false
          if (isWatermarked(item)) return false
          const pageUrl = (item.link || '').toLowerCase()
          const title = (item.title || '').toLowerCase()
          if (/taobao\.com|tmall\.com|jd\.com|pinduoduo\.|1688\.com|amazon\.|ebay\./i.test(pageUrl)) return false
          if (/\.(news|blog|blogger)\.|sohu\.com|thepaper\.cn|163\.com|sina\.com\.cn|oeeee\.com|rmzxw\.com\.cn|people\.com\.cn|xinhuanet\./i.test(pageUrl)) return false
          if (/图片素材|png素材|免费.*图案|图精灵|矢量图|eps素材/i.test(title)) return false
          return true
        })
        .map((item) => ({
          title: item.title || query,
          image: item.original,
          pageUrl: item.link || item.original,
          source: 'SerpAPI 图片搜索',
          description: item.snippet || `由关键词"${query}"搜索得到的候选图片。`,
        }))
    } catch {
      return []
    }
  }))).flat()
  return results
}

/** Bing HTML 爬取（API 不可用时的兜底） */
async function searchImagesViaBingHtml(queries) {
  const results = []
  for (const query of queries.slice(0, 3)) {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query + ' 刺绣 实物 -壁纸 -素材 -矢量 -图标')}&form=HDRSC2`
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
        },
      }, 7000)
      const html = await response.text()
      results.push(...extractBingImageResults(html, query))
    } catch {
      // Keep the feature usable with other queries or fallback assets.
    }
  }
  // 对 Bing 结果也做水印过滤
  const cleanResults = results.filter((r) => !isWatermarked({ title: r.title || '', link: r.pageUrl || '', snippet: r.description || '', image: r.image || '' }))
  return dedupeBy(cleanResults, (item) => item.image)
}

function extractBingImageResults(html, query) {
  const results = []
  // 尝试多种解析策略
  const patterns = [
    /m=”([^”]+)”/g,
    /”m”\s*:\s*”([^”]+)”/g,
    /mediaurl=”([^”]+)”/gi,
    /”contentUrl”\s*:\s*”([^”]+)”/g,
  ]
  const urlsFound = new Set()
  for (const regex of patterns) {
    let match
    while ((match = regex.exec(html))) {
      try {
        let image = ''
        let title = query
        if (match[0].startsWith('m=') || match[0].startsWith('”m”')) {
          const meta = JSON.parse(match[1].replace(/&quot;/g, '”'))
          image = meta.turl || meta.murl || ''
          title = meta.t || query
        } else {
          image = match[1]
        }
        if (!image || !/^https?:\/\//i.test(image) || urlsFound.has(image)) continue
        urlsFound.add(image)
        results.push({
          title,
          image,
          pageUrl: buildSearchUrl(query),
          source: '公开图片检索',
          description: `由关键词”${query}”联网检索得到的候选图片。`,
        })
        if (results.length >= 8) break
      } catch {
        // Ignore malformed image metadata.
      }
    }
    if (results.length >= 8) break
  }
  return results
}

function dedupeBy(items, getKey) {
  const seen = new Set()
  return items.filter((item) => {
    const key = getKey(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function proxiedImageUrl(url) {
  if (!/^https?:\/\//i.test(url)) return url
  return `/api/ai/image-proxy?url=${encodeURIComponent(url)}`
}

/** 标准化 URL 用于去重比较（和前端 normalizeUrl 保持一致） */
function normalizeUrl(url) {
  return (url || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
}

/** 从各种格式中提取原始图片 URL（代理 URL / 本地路径 / data URL） */
function extractOriginalUrl(url) {
  if (!url) return ''
  if (url.startsWith('/api/ai/image-proxy?url=')) {
    try { return decodeURIComponent(url.split('url=')[1]?.split('&')[0] || '') } catch {}
  }
  return url
}

/** 检测图片是否带水印（通过标题、来源域名、URL 特征） */
function isWatermarked(item) {
  const title = (item.title || '').toLowerCase()
  const pageUrl = (item.link || item.hostPageUrl || '').toLowerCase()
  const imageUrl = (item.original || item.image || '').toLowerCase()
  const snippet = (item.snippet || '').toLowerCase()
  const allText = [title, pageUrl, snippet].join(' ')

  // 中文水印/素材关键字（含常见版权声明）
  const watermarkKeywords = /水印|watermark|stock\s*(photo|image|vector|illustration)|矢量图|免版税|royalty.?free|版权作品|版权声明|仅限学习|禁止商用|商用授权/i.test(allText)

  // 已知水印图库域名（涵盖中外常见素材站）
  const stockDomains = /shutterstock\.|istockphoto\.|123rf\.|depositphotos\.|dreamstime\.|alamy\.|gettyimages\.|vectorstock\.|freepik\.|vecteezy\.|canstockphoto\.|bigstockphoto\.|dissect\.|gograph\.com|58pic\.|nipic\.|shetu\.|huaban\.|veer\.|tukuppt\.|quanjing\.|pngtree\.|lovepik\.|taopic\.|zsbeike\.|sucai999\.|redocn\.|chinaz\.com|visualchina|vcg\.com|699pic\.|zcool\.com\.cn|duitang\.|tuweng\.|cnu\.cc|ssyer\.|ibaotu\.|woyaogexing\.|iconfont\.|easyicon\.|polayoutu\.|picjumbo\.|wallhaven\.|pixabay\.(com|net)|unsplash\.|pexels\.com/i.test(pageUrl)

  // URL 中含水印/图库特征
  const urlHasWatermark = /watermark|stock|shutterstock|istock|58pic|nipic|veer|vcg/i.test(imageUrl)

  return watermarkKeywords || stockDomains || urlHasWatermark
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function callDashScopeImage(payload, creation) {
  const imagePrompt = buildImagePrompt(payload, creation)
  const model = process.env.DASHSCOPE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL

  const response = await fetchWithTimeout(DASHSCOPE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getImageApiKey()}`,
    },
    body: JSON.stringify({
      model,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              {
                text: imagePrompt,
              },
            ],
          },
        ],
      },
      parameters: {
        negative_prompt:
          'low quality, blurry, watermark, text, logo, random ethnic style, inaccurate embroidery, messy edges',
        prompt_extend: true,
        watermark: false,
        n: 2,
        size: '1280*1280',
      },
    }),
  }, 45000)

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || data.code || 'DashScope image generation failed')
  }

  const images = extractImageUrls(data)
  if (!images.length) {
    throw new Error('DashScope did not return image URLs')
  }

  return {
    model,
    requestId: data.request_id || data.requestId || '',
    images,
  }
}

function buildImagePrompt(payload, creation) {
  const selection = payload.selection
  return [
    creation.concept,
    `文化基因：${Object.values(selection).filter(Boolean).join('，')}`,
    `应用场景：${selection.use || '文创产品'}`,
    '画面要求：民族刺绣纹样设计图，清晰闭合轮廓，中心构图，适合机绣路径转化，针迹质感明显，色块边界明确。',
    '风格要求：高级、克制、真实刺绣质感，不要文字，不要水印，不要品牌标志。',
    payload.prompt ? `结构化提示词：${payload.prompt}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeReferences(references, searchQueries, payload) {
  if (Array.isArray(references) && references.length) {
    return references.slice(0, 6).map((item) => ({
      title: item.title || '相关图片线索',
      url: item.url || buildSearchUrl(item.title || payload.query || searchQueries[0] || ''),
      reason: item.reason || '用于补充相关作品和图案应用参考。',
    }))
  }

  const queries = searchQueries.length
    ? searchQueries
    : [`${Object.values(payload.selection).filter(Boolean).join(' ')} 苗绣 刺绣 文创 作品`]

  return queries.slice(0, 4).map((query) => ({
    title: query,
    url: buildSearchUrl(query),
    reason: '自动生成的相关图片搜索线索。',
  }))
}

function buildSearchUrl(query) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
}

function extractImageUrls(data) {
  const urls = new Set()

  const visit = (value) => {
    if (!value) return
    if (typeof value === 'string') {
      if (/^https?:\/\/.+/i.test(value) && /\.(png|jpg|jpeg|webp)(\?|$)/i.test(value)) {
        urls.add(value)
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value === 'object') {
      for (const key of ['url', 'image', 'image_url', 'imageUrl']) {
        if (value[key]) visit(value[key])
      }
      Object.values(value).forEach(visit)
    }
  }

  visit(data)
  return [...urls].slice(0, 4)
}

function createDesignPlan(payload) {
  const genes = Object.values(payload.selection).filter(Boolean)
  const searchText = encodeURIComponent(`${genes.join(' ')} 苗绣 刺绣 文创 作品`)
  const title = `${payload.selection.shape || '民族纹样'}${payload.selection.use || '文创'}生图方案`
  const concept = `以${payload.selection.shape || '典型纹样'}为主体，采用${payload.selection.color || '民族色彩'}作为主视觉，用${payload.selection.craft || '传统针法'}强调边缘和针迹层次，表达${payload.selection.meaning || '吉祥'}寓意，落到${payload.selection.use || '文创产品'}场景。机绣转化时优先保留闭合轮廓、减少过碎渐变，并把复杂细节拆成包边、填充和走针三类路径。`

  return {
    provider: '智能学习结果',
    summary: '已根据文化基因和本地数据库生成自动归类与创作方案。',
    references: [
      {
        title: '公开图片参考搜索',
        url: `https://www.google.com/search?tbm=isch&q=${searchText}`,
        reason: '用于人工对照公开纹样、产品应用和展陈场景。',
      },
      {
        title: '非遗刺绣文创资料搜索',
        url: `https://www.google.com/search?q=${searchText}`,
        reason: '用于补充文创转化、非遗展陈和工艺说明资料。',
      },
    ],
    creation: {
      title,
      category: '文创产品',
      concept,
      tags: genes.length ? genes : ['AI 生图', '待标注'],
      confidence: 82,
    },
    images: [],
    nextActions: ['保存生成图到数据库', '人工校正形色工意用标签', '把选中图转为机绣路径与针法参数'],
  }
}

function sanitizeError(message = '') {
  return String(message)
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [redacted-key]')
}

function getTextApiKey() {
  return process.env.DASHSCOPE_TEXT_API_KEY || process.env.DASHSCOPE_API_KEY || ''
}

function getVlApiKey() {
  return process.env.DASHSCOPE_VL_API_KEY || getTextApiKey()
}

function getImageApiKey() {
  return process.env.DASHSCOPE_IMAGE_API_KEY || process.env.DASHSCOPE_API_KEY || ''
}
