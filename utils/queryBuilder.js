const { Op } = require('sequelize');
const { logger } = require('./logger');

/**
 * Build pagination options for Sequelize queries
 * @param {Object} query - Express request query object
 * @param {Object} options - Additional options
 * @returns {Object} Pagination options
 */
const buildPagination = (query, options = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || 10, 1),
    options.maxLimit || 100
  );
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
  };
};

/**
 * Build sorting options for Sequelize queries
 * @param {Object} query - Express request query object
 * @param {Object} defaultSort - Default sort options
 * @param {Array} allowedFields - Allowed fields for sorting
 * @returns {Array} Sort order array
 */
const buildSorting = (query, defaultSort = ['createdAt', 'DESC'], allowedFields = []) => {
  let sortField = query.sortBy || defaultSort[0];
  let sortOrder = (query.sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // Validate sort field
  if (allowedFields.length > 0 && !allowedFields.includes(sortField)) {
    logger.warn(`Invalid sort field: ${sortField}. Using default.`);
    sortField = defaultSort[0];
    sortOrder = defaultSort[1] || 'DESC';
  }

  return [[sortField, sortOrder]];
};

/**
 * Build filter conditions for Sequelize queries
 * @param {Object} query - Express request query object
 * @param {Object} filterMap - Mapping of query parameters to model fields
 * @returns {Object} Sequelize where conditions
 */
const buildFilters = (query, filterMap = {}) => {
  const where = {};
  const queryParams = { ...query };

  // Remove pagination and sorting parameters
  ['page', 'limit', 'sortBy', 'sortOrder'].forEach(param => delete queryParams[param]);

  // Apply filters based on the filterMap
  Object.entries(filterMap).forEach(([param, fieldInfo]) => {
    if (queryParams[param] !== undefined) {
      const fieldName = fieldInfo.field || param;
      const operator = fieldInfo.operator || 'eq';
      const value = queryParams[param];

      switch (operator.toLowerCase()) {
        case 'eq':
          where[fieldName] = value;
          break;
        case 'like':
          where[fieldName] = { [Op.like]: `%${value}%` };
          break;
        case 'ilike':
          where[fieldName] = { [Op.iLike]: `%${value}%` };
          break;
        case 'gt':
          where[fieldName] = { [Op.gt]: value };
          break;
        case 'gte':
          where[fieldName] = { [Op.gte]: value };
          break;
        case 'lt':
          where[fieldName] = { [Op.lt]: value };
          break;
        case 'lte':
          where[fieldName] = { [Op.lte]: value };
          break;
        case 'in':
          where[fieldName] = { [Op.in]: value.split(',') };
          break;
        case 'between':
          const [start, end] = value.split(',').map(v => v.trim());
          where[fieldName] = { [Op.between]: [start, end] };
          break;
        case 'not':
          where[fieldName] = { [Op.not]: value };
          break;
        case 'isnull':
          where[fieldName] = { [Op.is]: null };
          break;
        case 'notnull':
          where[fieldName] = { [Op.not]: null };
          break;
        default:
          where[fieldName] = value;
      }
    }
  });

  return where;
};

/**
 * Build query options for Sequelize model queries
 * @param {Object} query - Express request query object
 * @param {Object} options - Additional options
 * @returns {Object} Query options for Sequelize
 */
const buildQueryOptions = (query, options = {}) => {
  const {
    defaultSort = ['createdAt', 'DESC'],
    allowedSortFields = [],
    filterMap = {},
    include = [],
    attributes,
    group,
    distinct,
    paranoid = true,
  } = options;

  const pagination = buildPagination(query, options);
  const order = buildSorting(query, defaultSort, allowedSortFields);
  const where = buildFilters(query, filterMap);

  const queryOptions = {
    where,
    limit: pagination.limit,
    offset: pagination.offset,
    order,
    include,
    attributes,
    group,
    distinct,
    paranoid,
    raw: false,
    nest: true,
  };

  // Remove undefined values
  Object.keys(queryOptions).forEach(key => 
    queryOptions[key] === undefined && delete queryOptions[key]
  );

  return {
    queryOptions,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      offset: pagination.offset,
    },
  };
};

/**
 * Format paginated response
 * @param {Array} items - Array of items
 * @param {number} total - Total number of items
 * @param {Object} pagination - Pagination info
 * @returns {Object} Formatted paginated response
 */
const formatPaginatedResponse = (items, total, pagination) => {
  const totalPages = Math.ceil(total / pagination.limit);
  
  return {
    data: items,
    pagination: {
      total,
      totalPages,
      currentPage: pagination.page,
      pageSize: pagination.limit,
      hasNextPage: pagination.page < totalPages,
      hasPreviousPage: pagination.page > 1,
    },
  };
};

/**
 * Parse comma-separated fields parameter into an array of fields
 * @param {string} fieldsString - Comma-separated fields string
 * @param {Array} allowedFields - Allowed fields
 * @returns {Array} Array of field names
 */
const parseFields = (fieldsString, allowedFields = []) => {
  if (!fieldsString) return [];
  
  const fields = fieldsString.split(',').map(field => field.trim());
  
  if (allowedFields.length > 0) {
    return fields.filter(field => allowedFields.includes(field));
  }
  
  return fields;
};

/**
 * Build include options for eager loading
 * @param {string} includeString - Comma-separated include string
 * @param {Object} modelAssociations - Model associations definition
 * @returns {Array} Include options array
 */
const buildIncludeOptions = (includeString, modelAssociations = {}) => {
  if (!includeString) return [];
  
  return includeString.split(',')
    .map(include => include.trim())
    .filter(include => modelAssociations[include])
    .map(include => ({
      association: include,
      ...modelAssociations[include],
    }));
};

module.exports = {
  buildPagination,
  buildSorting,
  buildFilters,
  buildQueryOptions,
  formatPaginatedResponse,
  parseFields,
  buildIncludeOptions,
};
