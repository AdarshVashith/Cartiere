export default function ClothCard({ cloth, onTryOn, onWorn, onDelete }) {
  return (
    <div className="cloth-card-premium">
      <div className="card-img-wrap">
        <img
          src={cloth.imageUrl}
          alt={cloth.name}
        />
        <div className="card-badge badge-cat">{cloth.category}</div>
        <div className="card-badge badge-worn">Worn {cloth.wearCount || 0}x</div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Remove this item?')) onDelete(cloth.id);
          }}
          className="card-delete-btn"
          title="Remove"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>

      <div className="card-info">
        <h4 className="cloth-name">{cloth.name}</h4>
        <div className="cloth-meta">
          {cloth.brand && <span>{cloth.brand} · </span>}
          {cloth.color}
        </div>
        
        <div className="card-actions">
          <button onClick={() => onTryOn(cloth)} className="action-btn btn-try">Try on</button>
          <button onClick={() => onWorn(cloth.id)} className="action-btn btn-worn">Worn today</button>
        </div>
      </div>
    </div>
  )
}
