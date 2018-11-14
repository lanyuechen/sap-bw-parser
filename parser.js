class Parser {
  constructor() {}

  static getBasic(data) {

    const axisInfo = data.E_AXIS_INFO.item;
    const axisData = data.E_AXIS_DATA.item;
    const cellData = data.E_CELL_DATA.item;
    const txtSymbols = data.E_TXT_SYMBOLS.item;

    //AXIS, 0: Columns, 1: Rows, 255: Filters   //todo 事情没有这么简单
    const rowAxis = axisInfo.find(d => +d.AXIS === 1).CHARS.item;   //todo 空值检测
    const colAxis = axisInfo.find(d => +d.AXIS === 0).CHARS.item;

    //AXIS, 0: Columns, 1: Rows, 255: Filters
    const rowData = axisData.find(d => +d.AXIS === 1).SET.item;
    const colData = axisData.find(d => +d.AXIS === 0).SET.item;

    //filter
    const filter = txtSymbols.filter(d => d.SYM_TYPE === 'F').map(d => ({
      name: d.SYM_CAPTION,
      key: d.SYM_NAME,
      value: d.SYM_VALUE
    }));

    return {
      cellData, filter,
      rowAxis: [].concat(rowAxis),
      colAxis: [].concat(colAxis),
      rowData: [].concat(rowData),
      colData: [].concat(colData)
    };
  }

  static getLevels(rowData) {
    const levels = [];
    rowData.map(d => {
      if (levels.indexOf(d.TLEVEL) === -1) {
        levels.push(d.TLEVEL);
      }
    });
    return levels;
  }

  static parse(data) {
    let th = [], td = [];

    const { rowAxis, colAxis, rowData, colData, cellData, filter } = Parser.getBasic(data);

    const levels = Parser.getLevels(rowData);   //todo 是否包含多列分组

    const hieMap = rowAxis.reduce((p, n) => {   //每列是否包含层级
      if (n.HIENM) {
        p[n.CHANM] = n.HIENM;
      }
      return p;
    }, {});

    rowAxis.map(d => {
      if (d.HIENM && levels.length > 1) {    //层级名称,如果有则进行分层
        levels.map(level => {
          th.push({
            type: 'series',
            name: d.CAPTION + level,         //caption + tlevel 作为名称
            field: d.CHANM + level           //cname + tlevel 作为field
          });
        });
        return;
      }
      th.push({
        type: 'series',
        name: d.CAPTION,
        field: d.CHANM
      });
    });

    for (let i = 0; i < colAxis.length; i++) {
      th.push({
        type: 'series',
        name: colAxis[i].CAPTION,
        field: colAxis[i].CHANM
      });
    }

    const lastDataLevels = {};
    const colLen = colData.length / colAxis.length;
    rowData.slice(0, 100).map((d, i) => {   //todo 最终要去掉这个slice
      for (let j = 0; j < colLen; j++) {
        const idx = Math.floor(i / rowAxis.length) * colLen + j;
        td[idx] = td[idx] || {};

        if (hieMap[d.CHANM]) {
          levels.map(l => {     //todo 需确认levels是否为从小到大
            if (+l < d.TLEVEL) {
              td[idx][d.CHANM + l] = lastDataLevels[l];
            }
          });

          if (d.DRILLSTATE === 'L') {   //L: 叶子节点
            td[idx].leaf = true;
          }

          td[idx][d.CHANM + d.TLEVEL] = d.CAPTION || d.CHAVL;   //todo 这种获取值得方式并不可靠,需要可靠依据
          lastDataLevels[d.TLEVEL] = d.CAPTION || d.CHAVL;
        } else {
          td[idx][d.CHANM] = d.CAPTION || d.CHAVL;
        }

        if (!Object.values(hieMap).length) {
          td[idx].leaf = true;     //没有层级的情况都标记为叶子节点
        }

        colAxis.map((c, k) => {
          const cd = colData[j * colAxis.length + k];
          td[idx][cd.CHANM] = cd.CAPTION || cd.CHAVL;
        });
      }
    });

    cellData.map((d, i) => {
      td[i] = td[i] || {};
      td[i]['value'] = parseFloat(d.VALUE);
    });

    th.push({
      type: 'number',
      name: '值',
      field: 'value'
    });

    //过滤,只保留叶子节点
    td = td.filter(d => d.leaf);

    td.map(d => {
      th.map(h => {
        if (d[h.field] === undefined) {
          d[h.field] = '-';
        }
      });
    });

    return { th, td, filter };
  }
}