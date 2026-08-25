import { useLayoutEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { PHOTO_FILE_ACCEPT } from '../utils/asset-utils'

export function IntakeForm({ form, setForm, projectCategories, onSubmit, onFolderImport, folderInputRef, fileInputRef, aiSearchAnalysis, importStatus, isOpen = false, onToggle }) {
  const bodyRef = useRef(null)
  const firstRun = useRef(true)

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return

    gsap.killTweensOf(el)
    gsap.set(el, { display: 'block' })

    if (isOpen) {
      gsap.set(el, { height: 'auto', overflow: 'visible' })
      const h = el.scrollHeight
      if (firstRun.current) {
        gsap.set(el, { height: h, overflow: 'visible' })
      } else {
        gsap.set(el, { height: 0, overflow: 'hidden' })
        gsap.to(el, {
          height: h,
          duration: 0.4,
          ease: 'back.out(1.4)',
          overwrite: 'auto',
          onComplete: () => gsap.set(el, { overflow: 'visible' }),
        })
      }
    } else {
      if (firstRun.current) {
        gsap.set(el, { height: 0, overflow: 'hidden' })
      } else {
        gsap.set(el, { height: 0, overflow: 'hidden' })
      }
    }

    firstRun.current = false
  }, [isOpen])

  return (
    <div className="accordion-item">
      <button className="accordion-header" onClick={onToggle}>
        <span className="accordion-title">入库管理</span>
        <span className="accordion-meta">图片导入 · 手动录入</span>
        <span className={'accordion-arrow' + (isOpen ? ' open' : '')} />
      </button>
      <div className="accordion-body" ref={bodyRef} style={{ padding: 0 }}>
        <div style={{ padding: '0 18px 18px' }}>
          <div className="intake-layout">
            <div className="intake-actions">
              <button className="btn btn-secondary" type="button" onClick={() => folderInputRef.current?.click()}>
                选择图片文件夹
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                选择图片文件
              </button>
              <input
                ref={folderInputRef}
                className="folder-input"
                type="file"
                accept={PHOTO_FILE_ACCEPT}
                multiple
                webkitdirectory=""
                onChange={onFolderImport}
              />
              <input
                ref={fileInputRef}
                className="folder-input"
                type="file"
                accept={PHOTO_FILE_ACCEPT}
                multiple
                onChange={onFolderImport}
              />
            </div>
            {importStatus && (
              <div className="import-status" role="status">
                {importStatus}
              </div>
            )}
            {aiSearchAnalysis && (
              <div className="ai-analysis-note">
                <strong>AI 联网搜索结果</strong>
                <p>{aiSearchAnalysis}</p>
              </div>
            )}
            <div className="intake-form">
              <h3>手动录入</h3>
              <form onSubmit={onSubmit}>
                <label>
                  <span>图片名称</span>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：蝴蝶纹文创包样机" />
                </label>
                <label>
                  <span>归类</span>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {projectCategories.slice(1).map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>图片地址</span>
                  <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
                </label>
                <label>
                  <span>标签</span>
                  <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
                </label>
                <button className="btn btn-secondary" type="submit">存储到数据库</button>
              </form>
            </div>
          </div>
          <div className="learning-note">
            <strong>学习逻辑</strong>
            <p>每次点击"学习一次"，样本权重和置信度都会提升；真实系统中这里可替换为图像向量、标签校正和学习记录。</p>
          </div>
        </div>
      </div>
    </div>
  )
}
