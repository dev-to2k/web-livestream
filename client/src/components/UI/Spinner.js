import React from "react";

const Spinner = ({ size = "medium", className = "" }) => {
  const sizeClass = `spinner-${size}`;

  return (
    <div className={`spinner-container ${className}`}>
      <div className={`spinner ${sizeClass}`}></div>
    </div>
  );
};

export default Spinner;
