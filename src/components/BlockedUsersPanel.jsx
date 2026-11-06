import { unblockUser, useBlockedUsers } from "../utils/blockedUsers.js";
import "./blocked-users.css";

export default function BlockedUsersPanel() {
  const blocked = useBlockedUsers();
  return (
    <div className="drawer-info-card" data-qa="blocked-users">
      <strong>Blocked people</strong>
      <p className="compact-subtitle">You won't see community posts, replies or restock reports from people you block. They are not told.</p>
      {blocked.length ? (
        <ul className="blocked-users-list">
          {blocked.map((entry) => (
            <li key={entry.userId}>
              <span>{entry.label}</span>
              <button type="button" className="drawer-link" onClick={() => unblockUser(entry.userId)}>Unblock</button>
            </li>
          ))}
        </ul>
      ) : <p className="compact-subtitle">No one is blocked.</p>}
    </div>
  );
}
