import React from "react";
import styles from './Spinner.module.css';

const Spinner = ({ 
  size = "medium", 
  className = "", 
  containerType = "default", // default, loading, fullHeight, inline
  text = ""
}) => {
  const spinnerClasses = [
    styles.spinner,
    styles[size]
  ].filter(Boolean).join(' ');

  // For inline usage, return just the spinner without container
  if (containerType === "inline") {
    return (
      <span className={`${spinnerClasses} ${styles.spinnerInline} ${className}`}></span>
    );
  }

  // Determine container class based on type
  const getContainerClasses = () => {
    const baseClasses = [className];
    
    switch (containerType) {
      case "loading":
        baseClasses.push(styles.loadingContainer);
        break;
      case "fullHeight":
        baseClasses.push(styles.loadingContainerFullHeight);
        break;
      case "waiting":
        baseClasses.push(styles.waitingSpinner);
        break;
      default:
        baseClasses.push(styles.spinnerContainer);
    }
    
    return baseClasses.filter(Boolean).join(' ');
  };

  const containerClasses = getContainerClasses();

  return (
    <div className={containerClasses}>
      <div className={spinnerClasses}></div>
      {text && <p>{text}</p>}
    </div>
  );
};

export default Spinner;
