import React from "react";
import styles from './Spinner.module.css';

const Spinner = ({ size = "medium", className = "" }) => {
  const spinnerClasses = [
    styles.spinner,
    styles[size]
  ].filter(Boolean).join(' ');

  const containerClasses = [
    styles.spinnerContainer,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      <div className={spinnerClasses}></div>
    </div>
  );
};

export default Spinner;
