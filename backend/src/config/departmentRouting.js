const DEPARTMENT_ROUTING = {
  infrastructure: {
    'road_issue':         'Roads Authority',
    'electricity_issue':  'Electric Utility',
    'water_supply_issue': 'Water Bureau',
  },
  emergency: {
    'Flood':             'Disaster Risk Management',
    'Fire':              'Fire and Emergency Service',
    'Landslide':         'Disaster Risk Management',
    'Drought':           'Disaster Risk Management',
    'Food Shortage':     'Disaster Risk Management',
    'Medical Emergency': 'Health Bureau',
    'Disease Outbreak':  'Health Bureau',
    'Other':             'Disaster Risk Management',
  },
};

const INFRA_DEPARTMENTS = [
  { name: 'Roads Authority',        categories: ['road_issue'] },
  { name: 'Water Bureau',           categories: ['water_supply_issue'] },
  { name: 'Electric Utility',       categories: ['electricity_issue'] },
  { name: 'Health Bureau',          categories: [] },
  { name: 'Disaster Risk Management', categories: [] },
  { name: 'Fire and Emergency Service', categories: [] },
];

function resolveDepartment(reportType, categoryOrType) {
  const map = DEPARTMENT_ROUTING[reportType];
  if (!map) return 'General Services';
  return map[categoryOrType] || 'General Services';
}

function getDepartmentCategories(departmentName) {
  const dept = INFRA_DEPARTMENTS.find(d => d.name === departmentName);
  return dept ? dept.categories : [];
}

module.exports = {
  DEPARTMENT_ROUTING,
  INFRA_DEPARTMENTS,
  resolveDepartment,
  getDepartmentCategories,
};
