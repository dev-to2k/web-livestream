import React from "react";

const Toggle = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}) => {
  return (
    <div className={`toggle-control ${className}`}>
      <label className="toggle-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className="slider"></span>
      </label>
      {label && <span className="toggle-label">{label}</span>}
    </div>
  );
};

export default Toggle;
