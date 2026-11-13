import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../utils/constants';
export default function Topbar({ onMenu }) {
  const { user } = useAuth();
  return (
    <div className="topbar"><button className="menu" onClick={onMenu}>☰</button><span /> <span>👤 {user.full_name} · {ROLES[user.role]}</span></div>
  );
}
