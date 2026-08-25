export function AssetToolbar({ query, setQuery, activeCategory, setActiveCategory, projectCategories, onAutoLearn, onAutoOrganize, isLearning, isOrganizing }) {
  return (
    <div className="database-toolbar">
      <div className="search-field">
        <span>检索</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入：设备、蝴蝶纹、包边针、文创包..."
        />
      </div>
      <div className="category-tabs" aria-label="项目图片分类">
        {projectCategories.map((category) => (
          <button
            className={activeCategory === category ? 'tab tab-active' : 'tab'}
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="toolbar-actions">
        <button className="btn btn-primary" type="button" onClick={onAutoLearn} disabled={isLearning}>
          {isLearning ? '联网学习中...' : 'AI自学习'}
        </button>
        <button className="btn btn-primary" type="button" onClick={onAutoOrganize} disabled={isOrganizing}>
          {isOrganizing ? 'AI视觉识别+整理中...' : 'AI自动整理'}
        </button>
      </div>
    </div>
  )
}
