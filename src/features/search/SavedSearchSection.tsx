import Icon from "../../components/ui/Icon";
import { useDeleteSavedSearch, useSavedSearches } from "./savedSearchQueries";

interface SavedSearchSectionProps {
  onOpen: (query: string) => void;
}

function SavedSearchSection({ onOpen }: SavedSearchSectionProps) {
  const searches = useSavedSearches();
  const remove = useDeleteSavedSearch();
  if (searches.isPending) return null;
  if (searches.isError) {
    return (
      <p className="sidebar-error" role="alert">
        Saved searches could not be loaded.
      </p>
    );
  }
  if (!searches.data || searches.data.length === 0) return null;

  return (
    <section
      className="saved-search-section"
      aria-labelledby="saved-searches-label"
    >
      <p className="section-label" id="saved-searches-label">
        Saved searches
      </p>
      <ul className="shortcut-list">
        {searches.data.map((search) => (
          <li key={search.id}>
            <button
              className="shortcut-link"
              type="button"
              onClick={() => onOpen(search.query)}
            >
              <span aria-hidden="true">⌕</span>
              {search.name}
            </button>
            <button
              className="shortcut-remove"
              type="button"
              aria-label={`Delete saved search ${search.name}`}
              title={`Delete saved search ${search.name}`}
              data-tooltip="Delete saved search"
              disabled={remove.isPending}
              onClick={() => remove.mutate(search.id)}
            >
              <Icon name="trash" />
            </button>
          </li>
        ))}
      </ul>
      {remove.isError ? (
        <p className="sidebar-error" role="alert">
          Saved search could not be deleted.
        </p>
      ) : null}
    </section>
  );
}

export default SavedSearchSection;
