import React from "react";
import styles from './Toggle.module.css';

const Toggle = ({
  checked,
  onChange,
  label,
  disabled = false,
  className = "",
}) => {
  const toggleClasses = [
    styles.toggleControl,
    className
  ].filter(Boolean).join(' ');
  return (
    <div className={toggleClasses}>
      <label className={styles.toggleSwitch}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className={styles.slider}></span>
      </label>
      {label && <span className={styles.toggleLabel}>{label}</span>}
    </div>
  );
};

export default Toggle;
