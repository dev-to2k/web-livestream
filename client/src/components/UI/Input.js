import React from "react";
import styles from './Input.module.css';

const Input = ({
  label,
  error,
  className = "",
  containerClassName = "",
  ...props
}) => {
  const inputClasses = [
    styles.inputField,
    error && styles.inputError,
    className
  ].filter(Boolean).join(' ');

  const containerClasses = [
    styles.inputGroup,
    containerClassName
  ].filter(Boolean).join(' ');
  return (
    <div className={containerClasses}>
      {label && (
        <label htmlFor={props.id} className={styles.inputLabel}>
          {label}
        </label>
      )}
      <input
        className={inputClasses}
        {...props}
      />
      {error && <span className={styles.inputErrorMessage}>{error}</span>}
    </div>
  );
};

export default Input;
