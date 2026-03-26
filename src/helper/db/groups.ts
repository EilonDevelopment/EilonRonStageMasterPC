import { IGroup, ILC } from "../types";
import { db } from '../../db';
import useAppData from '../../hooks/useAppData';
import { normalizeProjectId } from '../functions';
import { useEffect } from "react";

const useGroupOperations = () => {
  const { lcs, updateLCs } = useAppData();

  const setGroupTare = async (group_id: string, status: string) => {
    return await db.groups.where('id').equals(group_id)
      .modify({ tare: status });
  };
  const setGroupZero = async (project_id: string, group_id: string) => {
    console.log('@db setGroupZero');
    const projectLCs: ILC[] = lcs.filter(lc => normalizeProjectId(lc.project_id) === normalizeProjectId(project_id));
    const updates = projectLCs.filter(lc => lc.groups?.split(',').includes(group_id))
      .map(item => {
        return {
          key: item.lc_id,
          changes: {
            psw: 0,
            zero: parseInt(item['realval'] || '0') * -1,
          }
        };
      });
    const updatedLcs = lcs.map(lc => {
      const update = updates.filter(item => item['key'] === lc.lc_id);
      if (update.length > 0) {
        return {
          ...lc,
          zero: update[0].changes.zero
        };
      }
      return lc;
    });
    await updateLCs(updatedLcs);
  };
  return {
    setGroupTare,
    setGroupZero,
  };
};
export default useGroupOperations;
