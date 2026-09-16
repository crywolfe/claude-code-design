// DesignCanvas — grid of labeled variations for side-by-side comparison
// Usage (React + Babel inline):
//   <DesignCanvas columns={3} label="Button variations">
//     <DesignCanvas.Cell label="Filled"><MyButton variant="filled"/></DesignCanvas.Cell>
//     <DesignCanvas.Cell label="Outline"><MyButton variant="outline"/></DesignCanvas.Cell>
//     <DesignCanvas.Cell label="Ghost"><MyButton variant="ghost"/></DesignCanvas.Cell>
//   </DesignCanvas>
//
// Exports: window.DesignCanvas

(() => {
  const canvasStyles = {
    root: {
      padding: '32px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      boxSizing: 'border-box',
      minHeight: '100vh',
    },
    label: {
      fontSize: '13px',
      color: '#666',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      marginBottom: '20px',
    },
    grid: (cols) => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: '24px',
    }),
    cell: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      minWidth: 0,
    },
    cellFrame: {
      padding: '24px',
      borderRadius: '6px',
      background: 'rgba(0,0,0,0.02)',
      border: '1px solid rgba(0,0,0,0.08)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '120px',
    },
    cellLabel: {
      fontSize: '12px',
      color: '#888',
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
    },
  };

  function DesignCanvas({ columns = 3, label, children }) {
    return React.createElement('div', { style: canvasStyles.root, 'data-design-canvas': '' },
      label && React.createElement('div', { style: canvasStyles.label }, label),
      React.createElement('div', { style: canvasStyles.grid(columns) }, children)
    );
  }

  function Cell({ label, children }) {
    return React.createElement('div', { style: canvasStyles.cell, 'data-canvas-cell': label || '' },
      React.createElement('div', { style: canvasStyles.cellFrame }, children),
      label && React.createElement('div', { style: canvasStyles.cellLabel }, label)
    );
  }

  DesignCanvas.Cell = Cell;
  Object.assign(window, { DesignCanvas });
})();
