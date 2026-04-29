import { DataGrid } from "@mui/x-data-grid";
import React, { FC, useEffect, useRef, useState } from "react";

import "./index.css";

interface CustomDataGridProps {
  classes?: string;
  loading?: boolean;
  columns: any[];
  data: any[];
  onRowAction?: (row: any) => void;
}

const CustomDataGrid: FC<CustomDataGridProps> = (props) => {
  const {
    classes = "",
    loading = false,
    columns,
    data,
    onRowAction = () => {},
  } = props;

  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 10,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      const width = element.offsetWidth || 0;
      setContainerWidth(width);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(element);

    window.addEventListener("resize", updateWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full min-w-0">
      {containerWidth > 0 ? (
        <DataGrid
          autoHeight
          loading={loading}
          rowHeight={54}
          rows={data}
          columns={columns}
          disableRowSelectionOnClick
          paginationModel={paginationModel}
          pageSizeOptions={[6, 10, 25, 50, 100]}
          className={`w-full px-4 cursor-pointer bg-transparent ${classes}`}
          onPaginationModelChange={setPaginationModel}
          onRowClick={(e) => onRowAction(e.row)}
          classes={{
            columnHeader: "text-gray3",
            withBorderColor: "!border-gray-500",
            cellContent: "!text-dark dark:!text-light",
            overlay: "!bg-transparent text-gray3",
            footerContainer: "!border-none",
          }}
        />
      ) : (
        <div className="w-full min-h-[120px]" />
      )}
    </div>
  );
};

export default CustomDataGrid;


/*import { DataGrid } from "@mui/x-data-grid";
import React, { FC, useState } from "react";

import "./index.css";

interface CustomDataGridProps {
  classes?: string;
  loading?: boolean;
  columns: any[];
  data: any[];
  onRowAction?: (row: any) => void;
}

const CustomDataGrid: FC<CustomDataGridProps> = (props) => {
  const {
    classes = "",
    loading = false,
    columns,
    data,
    onRowAction = () => {},
  } = props;

  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 10,
  });

  return (
    <div className="w-full min-w-0">
      <DataGrid
        autoHeight
        loading={loading}
        rowHeight={54}
        rows={data}
        columns={columns}
        disableRowSelectionOnClick
        paginationModel={paginationModel}
        pageSizeOptions={[6, 10, 25, 50]}
        className={`w-full px-4 cursor-pointer bg-transparent ${classes}`}
        onPaginationModelChange={setPaginationModel}
        onRowClick={(e) => onRowAction(e.row)}
        classes={{
          columnHeader: "text-gray3",
          withBorderColor: "!border-gray-500",
          cellContent: "!text-dark dark:!text-light",
          overlay: "!bg-transparent text-gray3",
          footerContainer: "!border-none",
        }}
      />
    </div>
  );
};

export default CustomDataGrid;

*/


/*import { DataGrid } from '@mui/x-data-grid';
import React, { FC, useState } from 'react';

import './index.css';

interface CustomDataGridProps {
    classes?: string;
    loading?: boolean;
    // eslint-disable-next-line
    columns: any[];
    // eslint-disable-next-line
    data: any[];
    // eslint-disable-next-line
    onRowAction?: (row: any) => void;
}

const CustomDataGrid: FC<CustomDataGridProps> = props => {
    const {
        classes = '',
        loading = false,
        columns,
        data,
        // eslint-disable-next-line
        onRowAction = () => {}
    } = props;

    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });

    return (
        <DataGrid
            autoHeight
            loading={loading}
            rowHeight={54}
            rows={data}
            columns={columns}
            disableRowSelectionOnClick
            paginationModel={paginationModel}
            pageSizeOptions={[6, 10, 25, 50]}
            className={`px-4 cursor-pointer bg-transparent overflow-auto ${classes}`}
            onPaginationModelChange={setPaginationModel}
            onRowClick={e => onRowAction(e.row)}
            classes={{
                columnHeader: 'text-gray3',
                withBorderColor: '!border-gray-500',
                cellContent: '!text-dark dark:!text-light',
                overlay: '!bg-transparent text-gray3',
                footerContainer: '!border-none'
            }}
        />
    )
}

export default CustomDataGrid;



*/
