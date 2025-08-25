import React from "react";

const Input = ({
  label,
  error,
  className = "",
  containerClassName = "",
  ...props
}) => {
  return (
    <div className={`input-group ${containerClassName}`}>
      {label && (
        <label htmlFor={props.id} className="input-label">
          {label}
        </label>
      )}
      <input
        className={`input-field ${error ? "input-error" : ""} ${className}`}
        {...props}
      />
      {error && <span className="input-error-message">{error}</span>}
    </div>
  );
};

export default Input;
