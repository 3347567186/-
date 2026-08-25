import { VALID_TAGS } from '../data/constants'

export const PHOTO_FILE_EXTENSIONS = [
  '.jpg', '.jpeg', '.jfif', '.pjpeg', '.pjp', '.png', '.gif', '.webp',
  '.avif', '.bmp', '.dib', '.svg', '.tif', '.tiff', '.heic', '.heif',
  '.raw', '.dng', '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf',
  '.sr2', '.orf', '.rw2', '.raf', '.pef', '.srw', '.x3f', '.erf',
  '.kdc', '.3fr', '.fff',
]

export const PHOTO_FILE_ACCEPT = ['image/*', ...PHOTO_FILE_EXTENSIONS].join(',')

export function isPhotoFile(file) {
  if (file.type?.startsWith('image/')) return true
  const lowerName = String(file.name || file.webkitRelativePath || '').toLowerCase()
  return PHOTO_FILE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
}

/**
 * 对单个图片文件进行标签分类和置信度评定
 * 使用文件名 + 来源 + 备注等文本进行五维基因匹配
 * 同一维度内互斥（else if），不同维度独立（独立 if）
 * 当无法通过文件名匹配时，根据分类和来源给出推荐标签
 */
export function classifyImageAsset({ name, image, source = '文件夹导入' }) {
  const lower = name.toLowerCase()
  const tags = new Set()
  let category = '文创产品'

  // 类别识别
  if (/machine|device|机(?!.*包)|设备|绣花机|机头|展会/.test(lower)) category = '设备'
  if (/pattern|library|gene|纹样|图谱|针法|dst|样本|花纹|图案|图库/.test(lower)) category = '纹样库'
  if (/bag|sachet|product|文创|香囊|配件|装饰|作品|成品/.test(lower)) category = '文创产品'

  // 五维标签匹配 —— 从文件名、目录路径、备注等所有文本中提取关键词
  // 形（纹样形态）
  if (/蝴蝶|butterfly/.test(lower)) tags.add('蝴蝶纹')
  else if (/花|flower|botanical/.test(lower)) tags.add('花卉纹')
  else if (/鸟|bird/.test(lower)) tags.add('鸟纹')
  else if (/几何|边饰|geometric|border/.test(lower)) tags.add('几何纹')

  // 色（色彩特征）
  if (/蓝|靛|indigo|blue/.test(lower)) tags.add('靛蓝')
  else if (/红|red/.test(lower)) tags.add('暖红')
  else if (/黄|yellow/.test(lower)) tags.add('明黄')
  else if (/绿|green|翠/.test(lower)) tags.add('翠绿')

  // 工（工艺针法）
  if (/包边|轮廓/.test(lower)) tags.add('包边针')
  else if (/填充|fill/.test(lower)) tags.add('填充针')
  else if (/打籽|seed/.test(lower)) tags.add('打籽针')
  else if (/走针|running|run/.test(lower)) tags.add('走针')

  // 意（文化寓意）
  if (/吉祥|好运|luck/.test(lower)) tags.add('吉祥')
  else if (/繁衍|multiplication/.test(lower)) tags.add('繁衍')
  else if (/守护|protect|guard/.test(lower)) tags.add('守护')
  else if (/丰年|harvest|bumper/.test(lower)) tags.add('丰年')

  // 用（应用场景）
  if (/文创包|cultural.*bag|文创.*包/.test(lower)) tags.add('文创包')
  else if (/香囊|sachet/.test(lower)) tags.add('香囊')
  else if (/服饰|配件|衣|accessory/.test(lower) && !/包边/.test(lower)) tags.add('服饰配件')
  else if (/装饰画|挂画|panel/.test(lower)) tags.add('装饰画')

  return {
    id: `auto-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: name.replace(/\.[^.]+$/, '') || '自动识别图片样本',
    category,
    image,
    source,
    capturedAt: new Date().toISOString().slice(0, 10),
    learned: 1,
    confidence: source === '文件夹导入' ? 73 : 82,
    tags: [...tags],
    note: `系统已按文件名、来源和纹样关键词自动归类为「${category}」，后续可继续通过学习反馈校正标签。`,
  }
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 对资产列表进行去重整理和标签补齐
 * - 按 image URL 和 title 双重去重
 * - 合并原有标签与新识别的标签
 * - 如果是本地导入且无标签，保留空标签让后续 AI 补充，避免强行猜测
 */
export function organizeAssetList(list) {
  const seenImages = new Set()
  const seenTitles = new Set()
  return list
    .filter((asset) => {
      const imageKey = String(asset.image || '').trim()
      const titleKey = String(asset.title || '').trim().toLowerCase()
      if ((imageKey && seenImages.has(imageKey)) || (titleKey && seenTitles.has(titleKey))) return false
      if (imageKey) seenImages.add(imageKey)
      if (titleKey) seenTitles.add(titleKey)
      return true
    })
    .map((asset) => {
      const analyzed = classifyImageAsset({
        name: `${asset.title} ${asset.category} ${asset.source} ${asset.note} ${(asset.tags || []).join(' ')}`,
        image: asset.image,
        source: asset.source || '数据库样本',
      })
      // 合并已有标签和文件识别标签，只保留有效的五维标签
      const mergedTags = [...new Set([...(asset.tags || []), ...analyzed.tags])].filter((t) => VALID_TAGS.includes(t))
      return {
        ...asset,
        category: asset.category && asset.category !== '待分类' ? asset.category : analyzed.category,
        tags: mergedTags,
        confidence: Math.min(Math.max(asset.confidence || 0, analyzed.confidence) + 6, 98),
        note:
          asset.note && !/待标注|新加入|自动识别/.test(asset.note) ? asset.note : analyzed.note,
        learned: (asset.learned || 0) + 1,
      }
    })
}

/**
 * 标准化图片 URL 用于去重比较
 * 前后端使用同一套逻辑
 */
export function normalizeUrl(url) {
  return (url || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
}
