function formatPhoneNumber(phoneNumberString) {
  var cleaned = ("" + phoneNumberString).replace(/\D/g, "");
  var match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
  if (match) {
    const formattedPhone = "+1" + match[1] + match[2] + match[3];
    return formattedPhone;
  }
  return null;
}

function searchMessageForFilters(filters, string) {
  console.log(string);
  if (string.includes("covid app test")) {
    return ["Cat"];
  }
  return [
    ...filters.filter((filter) => string.includes(filter.toLowerCase())),
    "All",
  ];
}

module.exports = {
  formatPhoneNumber,
  searchMessageForFilters,
};
