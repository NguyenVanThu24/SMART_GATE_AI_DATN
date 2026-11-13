export default function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal"><div className="mh"><h3>{title}</h3><button className="btn g" onClick={onClose}>✕</button></div>{children}</div>
    </div>
  );
}
