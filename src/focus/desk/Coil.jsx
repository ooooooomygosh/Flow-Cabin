import React from 'react';

// The wire coil along the top: pairs of black loops through punched holes (one SVG pattern, so it
// stays crisp at any width).
export default function Coil({ id }) {
  return <svg className="desk-cal-coil" aria-hidden="true" width="100%" height="30" preserveAspectRatio="xMinYMin slice">
    <defs><pattern id={id} width="34" height="30" patternUnits="userSpaceOnUse">
      <rect x="8" y="18" width="5" height="9" rx="2.5" fill="#21140b"/><rect x="21" y="18" width="5" height="9" rx="2.5" fill="#21140b"/>
      <rect x="7" y="2" width="5" height="22" rx="2.5" fill="#0d0d0f"/><rect x="8.2" y="3" width="1.4" height="19" rx=".7" fill="#8a8a92" opacity=".75"/>
      <rect x="20" y="2" width="5" height="22" rx="2.5" fill="#0d0d0f"/><rect x="21.2" y="3" width="1.4" height="19" rx=".7" fill="#8a8a92" opacity=".75"/>
    </pattern></defs>
    <rect width="100%" height="30" fill={`url(#${id})`}/>
  </svg>;
}

