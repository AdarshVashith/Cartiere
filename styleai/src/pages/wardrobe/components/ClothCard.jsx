export default function ClothCard({ cloth, onTryOn, onWorn, onDelete, onToggleFreeze }) {
  const isFrozen = cloth.isFrozen || false;

  return (
    <div className={`cloth-card-premium ${isFrozen ? 'is-frozen' : ''}`}>
      <div className="card-img-wrap">
        <img
          src={cloth.imageUrl}
          alt={cloth.name}
        />
        <div className="card-badge badge-cat">{cloth.category}</div>
        <div className="card-badge badge-worn">Worn {cloth.wearCount || 0}x</div>
        
        {isFrozen && (
          <div className="card-badge badge-frozen">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m2 12 10 10 10-10M12 2v20M20 9.176l-4-4M4 9.176l4-4M20 14.824l-4 4M4 14.824l4 4"/></svg>
            Frozen
          </div>
        )}
        
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
          <button onClick={() => onTryOn(cloth)} className="action-btn btn-try">Try On</button>
          <button 
            onClick={() => onToggleFreeze(cloth.id, !isFrozen)} 
            className={`action-btn btn-freeze ${isFrozen ? 'active' : ''}`}
            title={isFrozen ? 'Unfreeze' : 'Freeze'}
          >
            {isFrozen ? 'Unfreeze' : 'Freeze'}
          </button>
          <button onClick={() => onWorn(cloth.id)} className="action-btn btn-worn">Worn</button>
        </div>
      </div>
    </div>
  )
}
